import qrcode from "qrcode-generator";
import { passNumber, ticketLink } from "./pass-code";

type PrintablePass = { id: number; name: string; token: string };
const mm = 72 / 25.4;
const ticketWidth = 170 * mm;
const ticketHeight = 60 * mm;
const qrSize = 26 * mm;
const qrMid = 148.5 * mm;
const scale = 2040 / ticketWidth;

export function download(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
}

function makeQr(pass: PrintablePass) {
  const qr = qrcode(0, "M");
  qr.addData(ticketLink(pass.token, window.location.origin));
  qr.make();
  return qr;
}

function dynamicText(pass: PrintablePass) {
  const canvas = document.createElement("canvas");
  canvas.width = 2040;
  canvas.height = 168;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser cannot generate the ticket.");
  context.fillStyle = "#f8e8d4";
  context.font = "48px system-ui, sans-serif";
  context.fillText(pass.name, 22 * scale, 94, 1080);
  context.font = "36px monospace";
  context.textAlign = "center";
  context.fillText(passNumber(pass.id), qrMid * scale, 23);
  return canvas;
}

export async function downloadTicket(pass: PrintablePass) {
  const background = new Image();
  background.src = "/ticket-background.png";
  await background.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 2040;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser cannot generate the ticket.");
  context.drawImage(background,0,0,canvas.width,canvas.height);
  context.drawImage(dynamicText(pass),0,550);
  const qr = makeQr(pass);
  const count = qr.getModuleCount();
  const step = Math.floor(qrSize * scale / (count+8));
  const size = step * (count+8);
  const left = Math.round(qrMid * scale - size/2);
  const top = Math.round((ticketHeight - 53 - qrSize/2) * scale - size/2);
  context.fillStyle = "#fff";
  context.fillRect(left,top,size,size);
  context.fillStyle = "#000";
  for (let row=0; row<count; row++) {
    for (let col=0; col<count; col++) {
      if (qr.isDark(row,col)) context.fillRect(left+(col+4)*step,top+(row+4)*step,step,step);
    }
  }
  download(canvas.toDataURL("image/png"), passNumber(pass.id) + ".png");
}

export async function downloadPrintSheet(passes: PrintablePass[]) {
  if (!passes.length) return;
  const [{ PDFDocument, PageSizes, rgb }, image] = await Promise.all([
    import("pdf-lib"), fetch("/ticket-background.png"),
  ]);
  if (!image.ok) throw new Error("Could not load the ticket design.");
  const pdf = await PDFDocument.create();
  pdf.setTitle("The Last Soirée | Printable passes");
  const background = await pdf.embedPng(await image.arrayBuffer());
  const [pageWidth,pageHeight] = PageSizes.A4;
  const gap = 8 * mm;
  const rows = 4;
  const pageTop = (pageHeight + (rows*ticketHeight + (rows-1)*gap)) / 2;
  const x = (pageWidth - ticketWidth)/2;
  for (let i=0; i<passes.length; i+=rows) {
    const page = pdf.addPage(PageSizes.A4);
    const group = passes.slice(i,i+rows);
    for (const [row, pass] of group.entries()) {
      const y = pageTop - (row+1)*ticketHeight - row*gap;
      page.drawImage(background,{x,y,width:ticketWidth,height:ticketHeight});
      const text = await pdf.embedPng(dynamicText(pass).toDataURL("image/png"));
      page.drawImage(text,{x,y:y+(720-550-168)/scale,width:ticketWidth,height:168/scale});

      const qr = makeQr(pass);
      const count = qr.getModuleCount();
      const step = qrSize / (count+8);
      const left = x + qrMid - qrSize/2;
      const bottom = y + 53;
      page.drawRectangle({x:left,y:bottom,width:qrSize,height:qrSize,color:rgb(1,1,1)});
      for (let j=0; j<count; j++) {
        let start = -1;
        for (let k=0; k<=count; k++) {
          if (k<count && qr.isDark(j,k)) {
            if (start === -1) start = k;
            continue;
          }
          if (start === -1) continue;
          page.drawRectangle({
            x:left+(start+4)*step,y:bottom+qrSize-(j+5)*step,
            width:(k-start)*step+.015,height:step+.015,color:rgb(0,0,0),
          });
          start = -1;
        }
      }

      const color = rgb(.32,.27,.25);
      for (const [cornerX, directionX] of [[x,-1],[x+ticketWidth,1]]) {
        for (const [cornerY, directionY] of [[y,-1],[y+ticketHeight,1]]) {
          page.drawLine({start:{x:cornerX+2*directionX,y:cornerY},end:{x:cornerX+9*directionX,y:cornerY},thickness:.55,color});
          page.drawLine({start:{x:cornerX,y:cornerY+2*directionY},end:{x:cornerX,y:cornerY+9*directionY},thickness:.55,color});
        }
      }
    }
  }
  const bytes = await pdf.save();
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], {type:"application/pdf"}));
  download(url,"The-Last-Soiree-Print-Passes.pdf");
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
