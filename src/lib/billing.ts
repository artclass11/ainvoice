import { addAuditEvent, db, type Customer, type Invoice, type InvoiceLine, type Payment, type PaymentMethod, type PaymentStatus, type Product } from "./db";

export interface DraftLineInput {
  productId?: number;
  sku?: string;
  description: string;
  unit?: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor?: number;
  taxRateBps: number;
}
export interface CreateInvoiceInput {
  customerId?: number;
  customerName: string;
  lines: DraftLineInput[];
  paidMinor?: number;
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  notes?: string;
}
export interface InvoiceTotals {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  lines: InvoiceLine[];
}

export function calculateInvoiceTotals(lines: DraftLineInput[]): InvoiceTotals {
  if (!lines.length) throw new Error("Add at least one item.");
  let subtotalMinor=0, discountMinor=0, taxMinor=0;
  const calculatedLines=lines.map(line=>{
    if(!line.description.trim())throw new Error("Every item needs a name.");
    if(!Number.isFinite(line.quantity)||line.quantity<=0||line.quantity>1_000_000)throw new Error("Quantity must be greater than zero.");
    if(!Number.isSafeInteger(line.unitPriceMinor)||line.unitPriceMinor<0)throw new Error("Enter a valid price.");
    if(!Number.isSafeInteger(line.taxRateBps)||line.taxRateBps<0||line.taxRateBps>10000)throw new Error("Enter a valid tax rate.");
    const gross=Math.round(line.quantity*line.unitPriceMinor);
    const discount=line.discountMinor??0;
    if(!Number.isSafeInteger(discount)||discount<0||discount>gross)throw new Error("Discount cannot exceed the item amount.");
    const taxable=gross-discount;
    const lineTax=Math.round(taxable*line.taxRateBps/10000);
    const total=taxable+lineTax;
    subtotalMinor+=gross;discountMinor+=discount;taxMinor+=lineTax;
    return {productId:line.productId,sku:line.sku,description:line.description.trim(),unit:line.unit??"pcs",quantity:line.quantity,unitPriceMinor:line.unitPriceMinor,discountMinor:discount,taxRateBps:line.taxRateBps,taxableMinor:taxable,taxMinor:lineTax,totalMinor:total};
  });
  const totalMinor=subtotalMinor-discountMinor+taxMinor;
  if(![subtotalMinor,discountMinor,taxMinor,totalMinor].every(Number.isSafeInteger))throw new Error("This bill is too large to calculate safely.");
  return {subtotalMinor,discountMinor,taxMinor,totalMinor,lines:calculatedLines};
}

export function getPaymentStatus(paidMinor:number,totalMinor:number):PaymentStatus {
  if(paidMinor<=0)return "due";
  if(paidMinor>=totalMinor)return "paid";
  return "partial";
}

export async function createInvoice(input:CreateInvoiceInput):Promise<Invoice> {
  const customerName=input.customerName.trim();
  if(!customerName)throw new Error("Enter a customer name.");
  const totals=calculateInvoiceTotals(input.lines);
  const now=new Date();
  const dateISO=[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");
  const paidMinor=input.paidMinor??0;
  if(!Number.isSafeInteger(paidMinor)||paidMinor<0||paidMinor>totals.totalMinor)throw new Error("Payment must be between zero and the bill total.");

  return db.transaction("rw",db.settings,db.invoices,db.products,db.payments,db.stockMovements,db.auditEvents,async()=>{
    const settings=await db.settings.get("main");
    const prefix=settings?.invoicePrefix||"AI";
    const sequence=(settings?.invoiceSequence??0)+1;
    const invoiceNo=prefix+"-"+String(now.getFullYear()).slice(-2)+String(now.getMonth()+1).padStart(2,"0")+"-"+String(sequence).padStart(5,"0");

    for(const line of totals.lines){
      if(!line.productId)continue;
      const product=await db.products.get(line.productId);
      if(!product||!product.active)throw new Error("Item not found: "+line.description);
      if(product.trackStock){
        const used=Math.round(line.quantity*1000);
        if(product.stockQuantityMilli<used)throw new Error("Insufficient stock for "+product.name+". Available: "+(product.stockQuantityMilli/1000).toFixed(3)+".");
        await db.products.update(product.id!,{stockQuantityMilli:product.stockQuantityMilli-used,updatedAt:Date.now()});
        await db.stockMovements.add({productId:product.id!,productName:product.name,type:"sale",quantityDeltaMilli:-used,referenceType:"invoice",note:invoiceNo,createdAt:Date.now()});
      }
    }
    const invoice:Invoice={
      invoiceNo,createdAt:Date.now(),dateISO,customerId:input.customerId,customerName,
      lines:totals.lines,subtotalMinor:totals.subtotalMinor,discountMinor:totals.discountMinor,taxMinor:totals.taxMinor,totalMinor:totals.totalMinor,
      paidMinor,paymentStatus:getPaymentStatus(paidMinor,totals.totalMinor),status:"issued",notes:input.notes?.trim(),
      currencyCode:settings?.currencyCode||"INR",schemaVersion:1
    };
    const invoiceId=await db.invoices.add(invoice);
    if(paidMinor>0)await db.payments.add({invoiceId,invoiceNo,customerId:input.customerId,customerName,amountMinor:paidMinor,method:input.paymentMethod??"cash",reference:input.paymentReference??"",note:"Payment at billing",paidAt:Date.now()});
    if(settings)await db.settings.update("main",{invoiceSequence:sequence,updatedAt:Date.now()});
    await addAuditEvent({entityType:"invoice",entityId:invoiceId,action:"issued",summary:"Issued "+invoiceNo+" for "+invoice.totalMinor+" minor units"});
    return {...invoice,id:invoiceId};
  });
}

export async function recordPayment(input:{invoiceId:number;amountMinor:number;method:PaymentMethod;reference?:string;note?:string}):Promise<Invoice>{
  if(!Number.isSafeInteger(input.amountMinor)||input.amountMinor<=0)throw new Error("Enter a payment greater than zero.");
  return db.transaction("rw",db.invoices,db.payments,db.auditEvents,async()=>{
    const invoice=await db.invoices.get(input.invoiceId);
    if(!invoice)throw new Error("Bill not found.");
    if(invoice.status!=="issued")throw new Error("Voided bills cannot receive payments.");
    const balance=invoice.totalMinor-invoice.paidMinor;
    if(input.amountMinor>balance)throw new Error("Payment cannot exceed the amount due.");
    const payment:Omit<Payment,"id">={invoiceId:invoice.id!,invoiceNo:invoice.invoiceNo,customerId:invoice.customerId,customerName:invoice.customerName,amountMinor:input.amountMinor,method:input.method,reference:input.reference?.trim()??"",note:input.note?.trim()??"",paidAt:Date.now()};
    await db.payments.add(payment);
    const paidMinor=invoice.paidMinor+input.amountMinor;
    const updated={...invoice,paidMinor,paymentStatus:getPaymentStatus(paidMinor,invoice.totalMinor)};
    await db.invoices.put(updated);
    await addAuditEvent({entityType:"payment",entityId:input.invoiceId,action:"received",summary:"Received payment for "+invoice.invoiceNo});
    return updated;
  });
}

export async function voidInvoice(invoiceId:number,reason:string):Promise<void>{
  const note=reason.trim();if(note.length<3)throw new Error("Enter a short reason for voiding this bill.");
  await db.transaction("rw",db.invoices,db.products,db.stockMovements,db.auditEvents,async()=>{
    const invoice=await db.invoices.get(invoiceId);
    if(!invoice)throw new Error("Bill not found.");
    if(invoice.status==="void")throw new Error("This bill is already void.");
    if(invoice.paidMinor>0)throw new Error("Refund or reconcile received payments before voiding this bill.");
    for(const line of invoice.lines){
      if(!line.productId)continue;
      const product=await db.products.get(line.productId);
      if(product?.trackStock){
        const qty=Math.round(line.quantity*1000);
        await db.products.update(product.id!,{stockQuantityMilli:product.stockQuantityMilli+qty,updatedAt:Date.now()});
        await db.stockMovements.add({productId:product.id!,productName:product.name,type:"return",quantityDeltaMilli:qty,referenceType:"invoice",referenceId:invoiceId,note:invoice.invoiceNo,createdAt:Date.now()});
      }
    }
    await db.invoices.update(invoiceId,{status:"void"});
    await addAuditEvent({entityType:"invoice",entityId:invoiceId,action:"voided",summary:"Voided "+invoice.invoiceNo+": "+note});
  });
}

export async function saveProduct(input:Omit<Product,"id"|"createdAt"|"updatedAt">,id?:number):Promise<number>{
  const name=input.name.trim(),sku=input.sku.trim().toUpperCase();
  if(!name)throw new Error("Enter an item name.");
  if(!sku)throw new Error("Enter a unique SKU or item code.");
  if(![input.salePriceMinor,input.purchasePriceMinor].every(v=>Number.isSafeInteger(v)&&v>=0))throw new Error("Enter valid item prices.");
  if(!Number.isSafeInteger(input.stockQuantityMilli)||input.stockQuantityMilli<0)throw new Error("Enter valid stock quantity.");
  return db.transaction("rw",db.products,db.stockMovements,db.auditEvents,async()=>{
    const duplicate=await db.products.where("sku").equals(sku).first();
    if(duplicate&&duplicate.id!==id)throw new Error("That SKU is already in use.");
    const now=Date.now(),old=id?await db.products.get(id):undefined;
    const saved=await db.products.put({...input,name,sku,id,createdAt:old?.createdAt??now,updatedAt:now});
    const previousStock=old?.stockQuantityMilli??0;
    const stockDelta=input.trackStock?input.stockQuantityMilli-previousStock:0;
    if(stockDelta!==0)await db.stockMovements.add({
      productId:saved,productName:name,type:"adjustment",quantityDeltaMilli:stockDelta,
      referenceType:"manual",note:old?"Manual stock adjustment":"Opening stock",createdAt:now
    });
    await addAuditEvent({entityType:"product",entityId:saved,action:id?"updated":"created",summary:(id?"Updated":"Created")+" item "+name});
    return saved;
  });
}

export async function saveCustomer(input:Omit<Customer,"id"|"createdAt"|"updatedAt">,id?:number):Promise<number>{
  const name=input.name.trim();if(!name)throw new Error("Enter a customer name.");
  return db.transaction("rw",db.customers,db.auditEvents,async()=>{
    const now=Date.now(),old=id?await db.customers.get(id):undefined;
    const saved=await db.customers.put({...input,name,id,createdAt:old?.createdAt??now,updatedAt:now});
    await addAuditEvent({entityType:"customer",entityId:saved,action:id?"updated":"created",summary:(id?"Updated":"Created")+" customer "+name});
    return saved;
  });
}
