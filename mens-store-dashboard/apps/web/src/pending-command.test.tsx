import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CommandHttpError, CommandScope, PendingCommandNotice, PendingCommandRunner, usePendingCommand } from './pending-command.js';

afterEach(()=>{cleanup();sessionStorage.clear();vi.restoreAllMocks();});
const validate=(input:unknown)=>{if(typeof (input as {amount?:unknown})?.amount!=='string')throw Error('invalid');};
const saved={version:1,key:'original-key',input:{amount:'19.9500',occurredAt:'2026-10-30T12:00:00.000Z'}};
function storage(raw:string|null=null){return {getItem:vi.fn(()=>raw),setItem:vi.fn(),removeItem:vi.fn()};}

it('restores a validated command and blocks unreadable envelopes rather than silently replacing them',()=>{
  expect(new PendingCommandRunner(storage(JSON.stringify(saved)),'scope',validate).pending).toEqual(saved);
  for(const raw of ['{','null',JSON.stringify({...saved,version:2}),JSON.stringify({...saved,key:5}),JSON.stringify({...saved,key:''}),JSON.stringify({...saved,key:'x'.repeat(201)}),JSON.stringify({...saved,input:{amount:3}})]){
    expect(new PendingCommandRunner(storage(raw),'scope',validate).blocked).toBe(true);
  }
  const unavailable=storage();unavailable.getItem.mockImplementation(()=>{throw Error('denied');});
  expect(new PendingCommandRunner(unavailable,'scope',validate).blocked).toBe(true);
});

it('persists before sending, snapshots input and retries the original key/body after uncertainty',async()=>{
  const port=storage();const runner=new PendingCommandRunner<{amount:string}>(port,'org.user.operation',validate);
  const input={amount:'19.9500'};const createKey=vi.fn(()=>'key-1');
  const send=vi.fn(async(body:{amount:string},key:string)=>{expect(port.setItem).toHaveBeenCalledWith('org.user.operation',expect.any(String));expect(key).toBe('key-1');expect(body.amount).toBe('19.9500');throw Error('lost response');});
  await expect(runner.run(()=>input,createKey,send)).rejects.toThrow('lost response');input.amount='100';
  const result=await runner.run(()=>({amount:'200'}),createKey,async(body,key)=>({body,key}));
  expect(result).toEqual({body:{amount:'19.9500'},key:'key-1'});expect(createKey).toHaveBeenCalledOnce();
  expect(runner.pending).toBeNull();expect(port.removeItem).toHaveBeenCalledWith('org.user.operation');
});

it('rejects synchronous duplicate attempts while the first request remains in flight',async()=>{
  const runner=new PendingCommandRunner<{amount:string}>(null,'memory',validate);let resolve!:(value:string)=>void;
  const send=vi.fn(()=>new Promise<string>(done=>{resolve=done;}));const first=runner.run(()=>({amount:'1'}),()=>'key',send);
  expect(runner.busy).toBe(true);expect(await runner.run(()=>({amount:'2'}),()=>'different',send)).toBeUndefined();
  expect(send).toHaveBeenCalledOnce();resolve('done');expect(await first).toBe('done');expect(runner.busy).toBe(false);
});

it('retains uncertain HTTP failures and clears only definite server rejections',async()=>{
  for(const status of [300,408,425,429,500]){
    const runner=new PendingCommandRunner(storage(),'scope',validate);
    await expect(runner.run(()=>({amount:'2'}),()=>'new',async()=>{throw new CommandHttpError('HTTP',status);})).rejects.toThrow('HTTP');
    expect(runner.pending).toEqual({version:1,key:'new',input:{amount:'2'}});expect(runner.busy).toBe(false);
  }
  for(const status of [400,401,403,404,409,422]){
    const runner=new PendingCommandRunner(storage(),'scope',validate);
    await expect(runner.run(()=>({amount:'2'}),()=>'new',async()=>{throw new CommandHttpError('HTTP',status);})).rejects.toThrow('HTTP');
    expect(runner.pending).toBeNull();
  }
  const recovered=new PendingCommandRunner(storage(JSON.stringify(saved)),'scope',validate);
  await expect(recovered.run(()=>({amount:'2'}),()=>'new',async()=>{throw new CommandHttpError('expired session',401);})).rejects.toThrow('expired session');expect(recovered.pending).toEqual(saved);
  const memory=new PendingCommandRunner<{amount:string}>(null,'memory',validate);
  await expect(memory.run(()=>({amount:'1'}),()=>'key',async()=>{throw new CommandHttpError('denied',403);})).rejects.toThrow('denied');
  expect(memory.pending).toBeNull();
});

it('never sends an unpersisted command and preserves recovery data when cleanup fails',async()=>{
  const port=storage();port.setItem.mockImplementation(()=>{throw Error('quota');});
  const runner=new PendingCommandRunner(port,'scope',validate);const send=vi.fn(async()=>1);
  await expect(runner.run(()=>({amount:'1'}),()=>'key',send)).rejects.toThrow('quota');expect(send).not.toHaveBeenCalled();expect(runner.busy).toBe(false);
  const denied=storage(JSON.stringify(saved));denied.removeItem.mockImplementation(()=>{throw Error('cleanup');});
  const retry=new PendingCommandRunner(denied,'scope',validate);
  await expect(retry.run(()=>({amount:'2'}),()=>'key',async()=>1)).rejects.toThrow('cleanup');expect(retry.pending).toEqual(saved);
  await expect(retry.run(()=>({amount:'2'}),()=>'key',async()=>{throw new CommandHttpError('rejected',409);})).rejects.toThrow('rejected');expect(retry.pending).toEqual(saved);
  const cleanupFailure=new PendingCommandRunner({...storage(),removeItem:()=>{throw Error('cleanup');}},'new',validate);
  await expect(cleanupFailure.run(()=>({amount:'2'}),()=>'key',async()=>{throw new CommandHttpError('rejected',409);})).rejects.toThrow('cleanup');expect(cleanupFailure.pending).not.toBeNull();
  const blocked=new PendingCommandRunner(storage('{'),'scope',validate);
  await expect(blocked.run(()=>({amount:'1'}),()=>'key',send)).rejects.toThrow('PENDING_COMMAND_UNREADABLE');
});

function Harness({send}:{send:(input:{amount:string},key:string)=>Promise<string>}){
  const command=usePendingCommand<{amount:string}>('test',validate);
  return <><PendingCommandNotice blocked={command.blocked} pending={!!command.pending} busy={command.busy} retry={()=>void command.run(()=>({amount:'changed'}),()=>'new',send).catch(()=>undefined)}><span>مبلغ الطلب {command.pending?.input.amount}</span></PendingCommandNotice><button disabled={command.busy} onClick={()=>void command.run(()=>({amount:'19.9500'}),()=>'key-1',send).catch(()=>undefined)}>إرسال</button></>;
}
it('updates the recovery UI and keeps tenant/user scopes isolated across rerenders',async()=>{
  const send=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue('done');
  const view=render(<CommandScope.Provider value="org.user1"><Harness send={send}/></CommandScope.Provider>);
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'إرسال'}));});
  expect(screen.getByText('مبلغ الطلب 19.9500')).toBeVisible();
  view.rerender(<CommandScope.Provider value="org.user2"><Harness send={send}/></CommandScope.Provider>);
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  view.rerender(<CommandScope.Provider value="org.user1"><Harness send={send}/></CommandScope.Provider>);
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'إعادة نفس الطلب المحفوظ'}));});
  expect(send).toHaveBeenLastCalledWith({amount:'19.9500'},'key-1');expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});

it('shows blocked recovery, pending progress and the nonpersistent standalone hook',async()=>{
  sessionStorage.setItem('ahmed-store.pending.org.user.test','{');
  const view=render(<CommandScope.Provider value="org.user"><Harness send={vi.fn()}/></CommandScope.Provider>);
  expect(screen.getByRole('alert')).toHaveTextContent('تعذر قراءة الطلب المحفوظ');view.unmount();
  const notice=render(<PendingCommandNotice blocked={false} pending busy retry={vi.fn()}/>);
  expect(screen.getByRole('button')).toBeDisabled();notice.unmount();
  const send=vi.fn(async()=>'done');render(<Harness send={send}/>);await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'إرسال'}));});expect(send).toHaveBeenCalledOnce();
});

it('shows a safe recovery block when the browser denies access to session storage itself',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage')!;
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,get(){throw Error('denied');}});
  try{render(<CommandScope.Provider value="org.user"><Harness send={vi.fn()}/></CommandScope.Provider>);expect(screen.getByRole('alert')).toHaveTextContent('تعذر قراءة الطلب المحفوظ');}
  finally{Object.defineProperty(globalThis,'sessionStorage',descriptor);}
});
