import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';import {afterEach,expect,it,vi} from 'vitest';
import {TreasuryMaintenance} from './TreasuryMaintenance.js';import {AccountSelect} from './AccountSelect.js';import {readJson} from './store-api.js';
vi.mock('./store-api.js',async original=>({...await original<typeof import('./store-api.js')>(),readJson:vi.fn()}));afterEach(()=>{cleanup();vi.resetAllMocks();});
const id='a62886aa-d435-4145-a551-37b675a86f84';
it('reviews account maintenance before issuing a versioned audited command',async()=>{
 vi.mocked(readJson).mockResolvedValue({id,version:2});const refresh=vi.fn();render(<TreasuryMaintenance refresh={refresh} accounts={[{id,name:'Cash desk',paymentMethod:'CASH',balance:'0.0000',version:1,active:true,isDefault:false}]}/>);
 fireEvent.click(screen.getByText('صيانة الخزائن'));fireEvent.change(screen.getByLabelText('خزينة الصيانة'),{target:{value:id}});fireEvent.change(screen.getByLabelText('اسم الخزينة الجديد'),{target:{value:'Front desk'}});fireEvent.change(screen.getByLabelText('سبب صيانة الخزينة'),{target:{value:'Reviewed rename'}});fireEvent.click(screen.getByRole('button',{name:'مراجعة تغيير الاسم'}));expect(readJson).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'تأكيد صيانة الخزينة'}));await waitFor(()=>expect(refresh).toHaveBeenCalledOnce());expect(JSON.parse(vi.mocked(readJson).mock.calls[0]![1]!.body as string)).toEqual({version:1,name:'Front desk',reason:'Reviewed rename'});
});
it('loads only method-matched account choices when the user opens the selector',async()=>{
 vi.mocked(readJson).mockResolvedValue({accounts:[{id,name:'Cash desk',paymentMethod:'CASH',isDefault:true},{id:'card',name:'Card desk',paymentMethod:'CARD',isDefault:false}]});const change=vi.fn();render(<AccountSelect method="CASH" label="Payment account" onChange={change}/>);expect(readJson).not.toHaveBeenCalled();fireEvent.focus(screen.getByLabelText('Payment account'));await screen.findByRole('option',{name:'Cash desk · افتراضية'});expect(screen.queryByRole('option',{name:'Card desk'})).not.toBeInTheDocument();fireEvent.change(screen.getByLabelText('Payment account'),{target:{value:id}});expect(change).toHaveBeenCalledWith(id);
});
