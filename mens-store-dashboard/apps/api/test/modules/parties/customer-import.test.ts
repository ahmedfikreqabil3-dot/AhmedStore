import ExcelJS from 'exceljs';
import {expect,it} from 'vitest';
import {customerImportTemplate,previewCustomerImport} from '../../../src/modules/parties/customer-import.js';
const headers=['Name','Phone','Email','Address','Notes','Credit Limit'];
async function file(rows:unknown[][],name='Customers',columns=headers){const book=new ExcelJS.Workbook(),sheet=book.addWorksheet(name);sheet.addRow(columns);rows.forEach(row=>sheet.addRow(row));return Buffer.from(await book.xlsx.writeBuffer());}

it('provides a header-only template and parses exact customer values with explicit unlimited credit',async()=>{
  const template=await customerImportTemplate();expect(await previewCustomerImport(template)).toMatchObject({valid:false,errors:[{message:'NO_ROWS'}]});
  const preview=await previewCustomerImport(await file([['أحمد','01000000000','ahmed@example.test','القاهرة','حساب جديد','0'],[],['محمد','','','','','12.1234']]));
  expect(preview).toMatchObject({valid:true,rows:[{row:2,name:'أحمد',phone:'01000000000',creditLimit:'0'},{row:4,name:'محمد',phone:null,email:null,address:null,notes:null,creditLimit:'12.1234'}],errors:[]});
});

it('rejects corrupt workbooks, missing sheets/columns, oversized sheets and invalid customer or credit cells',async()=>{
  expect(await previewCustomerImport(Buffer.from('not xlsx'))).toMatchObject({valid:false,errors:[{message:'INVALID_WORKBOOK'}]});
  expect(await previewCustomerImport(await file([],'Wrong'))).toMatchObject({errors:[{message:'EXPECTED_CUSTOMER_COLUMNS'}]});
  expect(await previewCustomerImport(await file([],'Customers',['Wrong']))).toMatchObject({errors:[{message:'EXPECTED_CUSTOMER_COLUMNS'}]});
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Customers');sheet.addRow(headers);sheet.getCell('A1002').value='Too many';expect(await previewCustomerImport(Buffer.from(await book.xlsx.writeBuffer()))).toMatchObject({errors:[{message:'TOO_MANY_ROWS'}]});
  const preview=await previewCustomerImport(await file([['x','','','','','0'],['Valid','','','','',''],['Valid two','','invalid','','','0']]));expect(preview.valid).toBe(false);expect(preview.errors.map(error=>error.row)).toEqual([2,3,4]);
});

it('rejects duplicate customer identity rows inside a file without conflating distinct contacts',async()=>{
  const preview=await previewCustomerImport(await file([['Alice','123','alice@example.test','','','0'],[' alice ','123','ALICE@example.test','','','10'],['Alice','456','other@example.test','','','0']]));
  expect(preview.rows).toHaveLength(2);expect(preview).toMatchObject({valid:false,errors:[{row:3,message:'DUPLICATE_IN_FILE'}]});
});
