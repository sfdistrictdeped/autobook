/* AutoBook 1.0.0 — local booklet imposition with numbering, borders, and theme support */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const MM = 72 / 25.4;
  const sizes = {
    A3:[297,420], A4:[210,297], A5:[148,210], A6:[105,148],
    Letter:[215.9,279.4], Legal:[215.9,355.6]
  };
  let sourceBytes = null, sourcePdf = null, outputBytes = null, plan = null, currentSide = "front";
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  function showError(message){ $("error").textContent=message; $("error").classList.remove("hidden"); }
  function clearError(){ $("error").textContent=""; $("error").classList.add("hidden"); }
  function dimensions(selectId, customW, customH, fallback) {
    const key=$(selectId).value;
    if(key==="custom") return [Number($(customW).value),Number($(customH).value)];
    return sizes[key] || fallback;
  }
  function settings(){
    const sheet=dimensions("sheetSize","sheetW","sheetH",[297,210]).slice();
    const page=dimensions("pageSize","pageW","pageH",[148,210]).slice();
    if($("orientation").value==="landscape") sheet.sort((a,b)=>b-a); else sheet.sort((a,b)=>a-b);
    return {sheet,page,binding:$("binding").value,scaling:$("scaling").value,
      gutter:Math.max(0,Number($("gutter").value)||0)*MM,
      margin:Math.max(0,Number($("margin").value)||0)*MM,
      colorMode:$("colorMode").value, numbering:$("numberingEnabled").value==="on",
      numberStart:Math.max(1,Number($("numberStartPage").value)||1),
      numberPlacement:$("numberPlacement").value, numberFont:$("numberFont").value,
      numberSize:Number($("numberSize").value)||10, borderStyle:$("borderStyle").value,
      borderThickness:Number($("borderThickness").value)||1, borderInset:Math.max(2,Number($("borderInset").value)||5)*MM};
  }
  function validGeometry(s){
    const usableW=s.sheet[0]*MM-2*s.margin-s.gutter, usableH=s.sheet[1]*MM-2*s.margin;
    if(usableW<=0||usableH<=0)return false;
    // Fit proportionally may shrink pages to the available printable area; Actual size must fit as selected.
    return s.scaling==="fit" || (s.page[0]*MM<=usableW/2+1&&s.page[1]*MM<=usableH+1);
  }
  function pagePairs(sequence,binding){
    const ordered=sequence.slice();
    while(ordered.length%4) ordered.push(0);
    const padded=ordered.length, sheets=[];
    for(let i=0;i<padded/4;i++){
      let fl=ordered[padded-1-2*i], fr=ordered[2*i], bl=ordered[2*i+1], br=ordered[padded-2-2*i];
      if(binding==="rtl"){[fl,fr]=[fr,fl];[bl,br]=[br,bl];}
      sheets.push({front:[fl,fr],back:[bl,br]});
    }
    return {padded,sheets};
  }
  function parsePageSelection(){
    const total=sourcePdf?sourcePdf.getPageCount():0, raw=($("pageRange")?.value||"all").trim().toLowerCase();
    if(!raw||raw==="all")return Array.from({length:total},(_,i)=>i+1);
    const pages=new Set();
    for(const part of raw.split(",")){
      const token=part.trim(); if(!token)continue;
      const match=token.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
      if(!match)throw new Error('Invalid page range. Use “all” or a list such as 1-3, 5, 8-10.');
      const start=Number(match[1]),end=Number(match[2]||match[1]);
      if(start<1||end<start||end>total)throw new Error(`Page range ${token} is outside the PDF's 1–${total} page range.`);
      for(let page=start;page<=end;page++)pages.add(page);
    }
    const result=[...pages].sort((x,y)=>x-y);
    if(!result.length)throw new Error("Select at least one source page.");
    return result;
  }
  function makeImpositionSequence(){
    const selected=parsePageSelection(), raw=($("blankAfterPages")?.value||"").trim();
    if(!raw)return selected;
    const after=new Set();
    for(const part of raw.split(",")){
      const token=part.trim();if(!token)continue;
      if(!/^\d+$/.test(token))throw new Error("Blank-page insertion accepts source page numbers separated by commas.");
      const page=Number(token);
      if(!selected.includes(page))throw new Error(`Cannot insert a blank after page ${page} because it is not in the selected page range.`);
      after.add(page);
    }
    const seq=[];selected.forEach(page=>{seq.push(page);if(after.has(page))seq.push(0);});return seq;
  }
  async function loadFile(file){
    clearError(); outputBytes=null; plan=null; $("results").classList.add("hidden");
    if(!file)return;
    if(!/\.pdf$/i.test(file.name)&&file.type!=="application/pdf"){showError("Please choose a PDF file.");return;}
    if(file.size>150*1024*1024){showError("This beta supports files up to 150 MB. Try optimizing the PDF first.");return;}
    try{
      const buf=await file.arrayBuffer();
      if(!window.PDFLib||!window.pdfjsLib) throw new Error("PDF libraries could not load. Check your internet connection, then reload AutoBook.");
      sourceBytes=buf;
      sourcePdf=await PDFLib.PDFDocument.load(buf,{ignoreEncryption:false});
      const pages=sourcePdf.getPageCount();
      if(!pages)throw new Error("This PDF does not contain any pages.");
      $("uploadedPdfName").textContent=file.name;
      $("fileInfoText").textContent=`${pages} pages · ${formatBytes(file.size)} · Ready to arrange`;
      $("pdfThumbPages").textContent=pages+" pages";$("numberStartPage").max=String(pages);
      await renderPdfThumbnail(buf);
      $("uploadedPdfCard").classList.remove("hidden");$("uploadActions").classList.remove("hidden");$("dropzone").classList.add("hidden");
      $("generate").disabled=false;$("proceedSettings").disabled=false;
    }catch(e){sourceBytes=null;sourcePdf=null;$("generate").disabled=true;$("uploadedPdfCard").classList.add("hidden");$("uploadActions").classList.add("hidden");$("dropzone").classList.remove("hidden");showError(e.message.includes("encrypted")?"This PDF appears to be password-protected. Please use an unlocked PDF.":"Could not read this PDF. It may be corrupt, encrypted, or unsupported. "+e.message);}
  }
  async function renderPdfThumbnail(bytes){
    try{
      const pdf=await pdfjsLib.getDocument({data:bytes.slice(0)}).promise;
      const page=await pdf.getPage(1),canvas=$("pdfThumbnailCanvas"),ctx=canvas.getContext("2d");
      const base=page.getViewport({scale:1}),scale=Math.min(120/base.width,150/base.height);
      const viewport=page.getViewport({scale});canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
      await page.render({canvasContext:ctx,viewport}).promise;await pdf.destroy();
    }catch(e){const canvas=$("pdfThumbnailCanvas");if(canvas){canvas.width=54;canvas.height=68;const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,54,68);ctx.fillStyle="#dbe4f1";for(let y=12;y<60;y+=8)ctx.fillRect(8,y,38,2);}}
  }
  function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function formatBytes(n){return n<1024*1024?(n/1024).toFixed(0)+" KB":(n/1024/1024).toFixed(1)+" MB";}
  function mm(v){return v*MM;}
  async function embedSourcePages(out){
    const embedded=[];
    if(settings().colorMode!=="grayscale"){
      for(let i=0;i<sourcePdf.getPageCount();i++) embedded.push(await out.embedPdf(sourceBytes,[i]).then(a=>a[0]));
      return embedded;
    }
    // Grayscale is an opt-in raster conversion. A moderate 2.5x render keeps text readable without excessive memory use.
    const pdf=await pdfjsLib.getDocument({data:sourceBytes.slice(0)}).promise;
    try{
      for(let i=1;i<=pdf.numPages;i++){
        const page=await pdf.getPage(i),viewport=page.getViewport({scale:2.5});
        const canvas=document.createElement("canvas");canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        const ctx=canvas.getContext("2d",{willReadFrequently:true});
        await page.render({canvasContext:ctx,viewport}).promise;
        const image=ctx.getImageData(0,0,canvas.width,canvas.height),d=image.data;
        for(let j=0;j<d.length;j+=4){const gray=Math.round(.2126*d[j]+.7152*d[j+1]+.0722*d[j+2]);d[j]=d[j+1]=d[j+2]=gray;}
        ctx.putImageData(image,0,0);embedded.push(await out.embedPng(canvas.toDataURL("image/png")));
        canvas.width=canvas.height=1;
      }
    } finally { await pdf.destroy(); }
    return embedded;
  }
  function applyPageDecor(sheet, pageNumber, pos, font, s){
    if(pageNumber<1||pageNumber>planSourceCount())return;
    const inset=Math.min(s.borderInset,Math.max(2,Math.min(pos.w,pos.h)/5));
    const x=pos.x+inset,y=pos.y+inset,w=Math.max(1,pos.w-2*inset),h=Math.max(1,pos.h-2*inset);
    const color=PDFLib.rgb(.12,.15,.28),thickness=s.borderThickness;
    if(s.borderStyle==="box"||s.borderStyle==="double"||s.borderStyle==="dashed"||s.borderStyle==="dotted"){
      sheet.drawRectangle({x,y,width:w,height:h,borderColor:color,borderWidth:thickness,borderDashArray:s.borderStyle==="dashed"?[5,3]:s.borderStyle==="dotted"?[1,3]:undefined});
      if(s.borderStyle==="double")sheet.drawRectangle({x:x+3,y:y+3,width:Math.max(1,w-6),height:Math.max(1,h-6),borderColor:color,borderWidth:Math.max(.4,thickness*.65)});
    } else if(s.borderStyle==="corners"){
      const l=Math.min(18,w/5,h/5);for(const [cx,cy,dx,dy] of [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]]){sheet.drawLine({start:{x:cx,y:cy},end:{x:cx+dx*l,y:cy},thickness,color});sheet.drawLine({start:{x:cx,y:cy},end:{x:cx,y:cy+dy*l},thickness,color});}
    } else if(s.borderStyle==="hearts"){
      const step=22;const heart=(cx,cy)=>{sheet.drawCircle({x:cx-1.8,y:cy+1.1,size:2.1,borderColor:color,borderWidth:thickness});sheet.drawCircle({x:cx+1.8,y:cy+1.1,size:2.1,borderColor:color,borderWidth:thickness});sheet.drawLine({start:{x:cx-3.7,y:cy+1},end:{x:cx,y:cy-3.2},thickness,color});sheet.drawLine({start:{x:cx,y:cy-3.2},end:{x:cx+3.7,y:cy+1},thickness,color});};for(let xx=x+6;xx<x+w-5;xx+=step){heart(xx,y+3);heart(xx,y+h-3);}for(let yy=y+12;yy<y+h-5;yy+=step){heart(x+3,yy);heart(x+w-3,yy);}
    } else if(s.borderStyle==="smileys"){
      const step=25;for(let xx=x+7;xx<x+w-7;xx+=step){for(const yy of [y+5,y+h-5]){sheet.drawCircle({x:xx,y:yy,size:4,borderColor:color,borderWidth:thickness});sheet.drawCircle({x:xx-1.3,y:yy+1,size:.45,color});sheet.drawCircle({x:xx+1.3,y:yy+1,size:.45,color});sheet.drawLine({start:{x:xx-1.7,y:yy-1.2},end:{x:xx+1.7,y:yy-1.2},thickness:.5,color});}}for(let yy=y+18;yy<y+h-10;yy+=step){for(const xx of [x+5,x+w-5]){sheet.drawCircle({x:xx,y:yy,size:4,borderColor:color,borderWidth:thickness});sheet.drawCircle({x:xx-1.3,y:yy+1,size:.45,color});sheet.drawCircle({x:xx+1.3,y:yy+1,size:.45,color});}}
    }
    if(s.numbering && pageNumber>=s.numberStart){
      const label=String(pageNumber-s.numberStart+1),size=s.numberSize,tw=font.widthOfTextAtSize(label,size);
      // Anchor numbering to the inside of the border, not the physical page edge.
      // This keeps every placement clear of box, double, dashed, dotted, corner, and emoji borders.
      const borderPad=s.borderStyle!=="none"?inset:0;
      const pad=Math.max(6,thickness*2+3);
      const left=pos.x+borderPad+pad,right=pos.x+pos.w-borderPad-pad;
      const bottom=pos.y+borderPad+pad,top=pos.y+pos.h-borderPad-pad-size;
      let tx=pos.x+(pos.w-tw)/2,ty=bottom;
      if(s.numberPlacement.startsWith("top"))ty=top;
      if(s.numberPlacement.endsWith("left"))tx=left;
      if(s.numberPlacement.endsWith("right"))tx=right-tw;
      sheet.drawText(label,{x:tx,y:ty,size,font,color:PDFLib.rgb(0,0,0)});
    }
  }
  function planSourceCount(){return sourcePdf?sourcePdf.getPageCount():0;}
  async function generate(){
    clearError(); if(!sourcePdf)return;
    const s=settings();
    if(!validGeometry(s)){showError("These sheet and finished-page dimensions do not fit together with the current margins and gutter. Choose a larger sheet, smaller finished page, or reduce the margins.");return;}
    const btn=$("generate");btn.disabled=true;btn.textContent="Generating…";
    try{
      const sequence=makeImpositionSequence();
      const {padded,sheets}=pagePairs(sequence,s.binding);
      const out=await PDFLib.PDFDocument.create();
      const embedded=await embedSourcePages(out);
      const fontNames={Helvetica:PDFLib.StandardFonts.Helvetica,TimesRoman:PDFLib.StandardFonts.TimesRoman,Courier:PDFLib.StandardFonts.Courier,HelveticaBold:PDFLib.StandardFonts.HelveticaBold,TimesRomanBold:PDFLib.StandardFonts.TimesRomanBold};
      const numberFont=await out.embedFont(fontNames[s.numberFont]||PDFLib.StandardFonts.Helvetica);
      const sheetW=mm(s.sheet[0]),sheetH=mm(s.sheet[1]),pageW=mm(s.page[0]),pageH=mm(s.page[1]);
      const usableW=sheetW-2*s.margin-s.gutter, halfW=usableW/2, usableH=sheetH-2*s.margin;
      const positions=[
        {x:s.margin,y:s.margin,w:halfW,h:usableH},
        {x:s.margin+halfW+s.gutter,y:s.margin,w:halfW,h:usableH}
      ];
      function drawPage(sheet,pageNumber,slot){
        const pos=positions[slot];
        if(pageNumber<1||pageNumber>sourcePdf.getPageCount())return;
        const pg=embedded[pageNumber-1], dims=pg.size();
        let w=pageW,h=pageH;
        if(s.scaling==="fit"){const ratio=Math.min(pos.w/dims.width,pos.h/dims.height);w=dims.width*ratio;h=dims.height*ratio;}
        else {const ratio=Math.min(1,pos.w/dims.width,pos.h/dims.height);w=dims.width*ratio;h=dims.height*ratio;}
        sheet.drawPage(pg,{x:pos.x+(pos.w-w)/2,y:pos.y+(pos.h-h)/2,width:w,height:h});
      }
      for(const sh of sheets){
        for(const side of ["front","back"]){
          const sheet=out.addPage([sheetW,sheetH]);
          drawPage(sheet,sh[side][0],0);drawPage(sheet,sh[side][1],1);
          applyPageDecor(sheet,sh[side][0],positions[0],numberFont,s);
          applyPageDecor(sheet,sh[side][1],positions[1],numberFont,s);
        }
      }
      out.setTitle("AutoBook Booklet Output");out.setSubject("Booklet-imposed PDF generated locally by AutoBook 1.0.0");
      outputBytes=await out.save();plan={s,padded,sheets,sourceCount:sourcePdf.getPageCount(),selectedCount:parsePageSelection().length,sequence,sheetW,sheetH};
      $("statPages").textContent=plan.sourceCount;$("statSheets").textContent=sheets.length;$("statBlanks").textContent=padded-plan.sequence.filter(n=>n>0).length;
      $("previewSheet").innerHTML=sheets.map((_,i)=>`<option value="${i}">Sheet ${i+1} of ${sheets.length}</option>`).join("");
      $("results").classList.remove("hidden");$("numberingStep").open=false;$("results").open=true;
      $("printNote").textContent=`Print ${sheets.length} sheets, double-sided, at 100% / Actual size. Selected source pages: ${plan.selectedCount}. Output: ${s.colorMode==="grayscale"?"grayscale":"full color"}. ${sheets.length*2} PDF pages represent front and back sides. ${padded-plan.sequence.filter(n=>n>0).length} blank page(s) were inserted where needed. Verify your printer's duplex flip-edge setting with a test copy.`;
      currentSide="front";$("frontBtn").classList.add("active");$("backBtn").classList.remove("active");$("sideLabel").textContent="Front side";
      await drawPreview();$("results").scrollIntoView({behavior:"smooth",block:"start"});
    }catch(e){showError("Booklet generation failed: "+e.message);}
    finally{btn.disabled=!sourcePdf;btn.innerHTML='Generate booklet PDF <span>→</span>';}
  }
  async function drawPreview(){
    if(!plan)return;
    const idx=Number($("previewSheet").value)||0, sh=plan.sheets[idx], pages=sh[currentSide];
    const canvas=$("previewCanvas"), ctx=canvas.getContext("2d");
    const scale=Math.min(1000/plan.sheetW,520/plan.sheetH);
    canvas.width=Math.round(plan.sheetW*scale);canvas.height=Math.round(plan.sheetH*scale);
    ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);
    const s=plan.s, margin=mm(s.margin), gutter=mm(s.gutter), usableW=plan.sheetW-2*margin-gutter,half=usableW/2,usableH=plan.sheetH-2*margin;
    ctx.strokeStyle="#d5deeb";ctx.lineWidth=1;ctx.strokeRect(0.5,0.5,canvas.width-1,canvas.height-1);
    ctx.setLineDash([7,5]);ctx.beginPath();ctx.moveTo((margin+half+gutter/2)*scale,0);ctx.lineTo((margin+half+gutter/2)*scale,canvas.height);ctx.stroke();ctx.setLineDash([]);
    for(let slot=0;slot<2;slot++){
      const n=pages[slot],x=(margin+(slot?half+gutter:0))*scale,y=margin*scale,w=half*scale,h=usableH*scale;
      ctx.strokeStyle="#c5d2e4";ctx.strokeRect(x,y,w,h);
      if(n>=1&&n<=plan.sourceCount){
        try{
          const task=pdfjsLib.getDocument({data:sourceBytes.slice(0)}),pdf=await task.promise,page=await pdf.getPage(n);
          const viewport=page.getViewport({scale:1}), fit=Math.min(w/viewport.width,h/viewport.height), vp=page.getViewport({scale:fit});
          const temp=document.createElement("canvas");temp.width=Math.ceil(vp.width);temp.height=Math.ceil(vp.height);
          await page.render({canvasContext:temp.getContext("2d"),viewport:vp}).promise;
          ctx.save();if(plan.s.colorMode==="grayscale")ctx.filter="grayscale(1)";ctx.drawImage(temp,x+(w-temp.width)/2,y+(h-temp.height)/2);ctx.restore();
          ctx.strokeStyle="#c5d2e4";ctx.strokeRect(x,y,w,h);
          await pdf.destroy();
        }catch(e){ctx.fillStyle="#a32d2d";ctx.font="12px sans-serif";ctx.fillText("Preview unavailable",x+8,y+20);}
      }else{
        ctx.fillStyle="#f4f7fb";ctx.fillRect(x,y,w,h);ctx.fillStyle="#9aa8ba";ctx.font="bold 14px sans-serif";ctx.textAlign="center";ctx.fillText("BLANK",x+w/2,y+h/2);ctx.textAlign="start";
      }
      ctx.fillStyle="#0878c5";ctx.font="bold 12px sans-serif";ctx.fillText(n>=1&&n<=plan.sourceCount?`Page ${n}`:"Blank page",x+8,y+17);
      const ps=plan.s;const inset=Math.min(ps.borderInset,Math.max(2,Math.min(w,h)/5)/scale)*scale;
      if(ps.borderStyle!=="none"){ctx.save();ctx.strokeStyle="#30365e";ctx.lineWidth=Math.max(1,ps.borderThickness);const bx=x+inset,by=y+inset,bw=w-2*inset,bh=h-2*inset;if(["dashed","dotted"].includes(ps.borderStyle))ctx.setLineDash(ps.borderStyle==="dashed"?[5,3]:[1,3]);if(["box","double","dashed","dotted"].includes(ps.borderStyle)){ctx.strokeRect(bx,by,bw,bh);if(ps.borderStyle==="double")ctx.strokeRect(bx+3,by+3,bw-6,bh-6);}else if(ps.borderStyle==="corners"){const l=Math.min(18,bw/5,bh/5);[[bx,by,1,1],[bx+bw,by,-1,1],[bx,by+bh,1,-1],[bx+bw,by+bh,-1,-1]].forEach(([cx,cy,dx,dy])=>{ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+dx*l,cy);ctx.moveTo(cx,cy);ctx.lineTo(cx,cy+dy*l);ctx.stroke();});}else{const symbol=ps.borderStyle==="hearts"?"♥":"☺";ctx.font="12px sans-serif";for(let xx=bx+4;xx<bx+bw-5;xx+=22){ctx.fillText(symbol,xx,by+10);ctx.fillText(symbol,xx,by+bh-2);}for(let yy=by+20;yy<by+bh-5;yy+=22){ctx.fillText(symbol,bx+1,yy);ctx.fillText(symbol,bx+bw-10,yy);}}ctx.restore();}
      if(ps.numbering&&n>=ps.numberStart){
        ctx.save();ctx.fillStyle="#000";
        ctx.font=`${ps.numberSize}px ${ps.numberFont.includes("Times")?"serif":ps.numberFont==="Courier"?"monospace":"sans-serif"}`;
        const label=String(n-ps.numberStart+1),tw=ctx.measureText(label).width;
        // Match the PDF output: keep the number safely inside the border's inner edge.
        const borderPad=ps.borderStyle!=="none"?inset:0;
        const pad=Math.max(5,ps.borderThickness*2+3);
        const left=x+borderPad+pad,right=x+w-borderPad-pad;
        const bottom=y+h-borderPad-pad,top=y+borderPad+pad+ps.numberSize;
        let tx=x+(w-tw)/2,ty=bottom;
        if(ps.numberPlacement.startsWith("top"))ty=top;
        if(ps.numberPlacement.endsWith("left"))tx=left;
        if(ps.numberPlacement.endsWith("right"))tx=right-tw;
        ctx.fillText(label,tx,ty);ctx.restore();
      }
    }
  }
  function download(){
    if(!outputBytes)return;
    const blob=new Blob([outputBytes],{type:"application/pdf"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="AutoBook-Booklet.pdf";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function reset(){
    sourceBytes=null;sourcePdf=null;outputBytes=null;plan=null;$("pdfFile").value="";$("uploadedPdfCard").classList.add("hidden");$("uploadActions").classList.add("hidden");$("dropzone").classList.remove("hidden");$("results").classList.add("hidden");$("generate").disabled=true;clearError();
    $("uploadStep").open=true;$("settingsStep").open=false;$("numberingStep").open=false;$("results").open=false;$("settingsStep").dataset.unlocked="false";$("numberingStep").dataset.unlocked="false";$("uploadStep").scrollIntoView({behavior:"smooth",block:"start"});
  }
  function resetSettings(){
    const defaults={sheetSize:"A4",pageSize:"A5",orientation:"landscape",binding:"ltr",scaling:"fit",colorMode:"color",gutter:"4",margin:"6",sheetW:"297",sheetH:"210",pageW:"148",pageH:"210",numberingEnabled:"off",numberStartPage:"1",numberPlacement:"bottom-center",numberFont:"Helvetica",numberSize:"10",borderStyle:"none",borderThickness:"1",borderInset:"5"};
    Object.entries(defaults).forEach(([id,v])=>{if($(id))$(id).value=v;});if($("pageRange"))$("pageRange").value="all";if($("blankAfterPages"))$("blankAfterPages").value="";try{localStorage.removeItem("autobook-preferences-v1");}catch(e){}$("customFields").classList.add("hidden");outputBytes=null;plan=null;$("results").classList.add("hidden");saveHistory();
  }
  $("pdfFile").addEventListener("change",e=>loadFile(e.target.files[0]));
  const dz=$("dropzone");["dragenter","dragover"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add("dragging");}));
  ["dragleave","drop"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove("dragging");}));
  dz.addEventListener("drop",e=>loadFile(e.dataTransfer.files[0]));
  $("testSheetBtn")?.addEventListener("click",async()=>{
    try{
      const s=settings(), w=mm(s.sheet[0]),h=mm(s.sheet[1]),doc=await PDFLib.PDFDocument.create(),page=doc.addPage([w,h]);
      const font=await doc.embedFont(PDFLib.StandardFonts.Helvetica),black=PDFLib.rgb(.08,.08,.08),gray=PDFLib.rgb(.55,.55,.55);
      page.drawRectangle({x:12,y:12,width:w-24,height:h-24,borderColor:black,borderWidth:.6});
      page.drawLine({start:{x:w/2,y:12},end:{x:w/2,y:h-12},color:gray,thickness:.5});
      page.drawText("AutoBook 1.0.1 — PRINT TEST SHEET",{x:18,y:h-32,size:12,font,color:black});
      page.drawText(`Paper: ${s.sheet[0]} × ${s.sheet[1]} mm | Orientation: ${$("orientation").value}`,{x:18,y:h-50,size:9,font,color:black});
      page.drawText("Print at 100% / Actual Size. Measure the 100 mm calibration line below.",{x:18,y:h-68,size:9,font,color:black});
      page.drawLine({start:{x:24,y:h/2},end:{x:24+mm(100),y:h/2},color:black,thickness:1});
      page.drawLine({start:{x:24,y:h/2-5},end:{x:24,y:h/2+5},color:black,thickness:1});
      page.drawLine({start:{x:24+mm(100),y:h/2-5},end:{x:24+mm(100),y:h/2+5},color:black,thickness:1});
      page.drawText("100 mm",{x:24,y:h/2+10,size:10,font,color:black});
      page.drawText("Duplex check: print this page on both sides and confirm the flip edge in your printer settings.",{x:18,y:28,size:8,font,color:black});
      const bytes=await doc.save(),blob=new Blob([bytes],{type:"application/pdf"}),url=URL.createObjectURL(blob),win=window.open(url,"_blank");
      if(!win){const a=document.createElement("a");a.href=url;a.download="AutoBook-Print-Test-Sheet.pdf";a.click();}
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(e){showError("Could not create the test sheet: "+e.message);}
  });
  $("generate").addEventListener("click",generate);$("reset").addEventListener("click",reset);$("resetSettings").addEventListener("click",resetSettings);
  $("removeUploadedPdf").addEventListener("click",reset);
  $("settingsStep").querySelector("summary").addEventListener("click",e=>{if($("settingsStep").dataset.unlocked!=="true"){e.preventDefault();showError("Upload a PDF, then press Proceed to Booklet Settings first.");}});
  $("numberingStep").querySelector("summary").addEventListener("click",e=>{if($("numberingStep").dataset.unlocked!=="true"){e.preventDefault();showError("Complete Booklet Settings, then press Proceed to Page Numbering & Borders.");}});
  $("proceedSettings").addEventListener("click",()=>{if(!sourcePdf){showError("Upload a PDF first.");return;}$("settingsStep").dataset.unlocked="true";$("uploadStep").open=false;$("settingsStep").open=true;$("numberingStep").open=false;$("settingsStep").scrollIntoView({behavior:"smooth",block:"start"});});
  $("proceedNumbering").addEventListener("click",()=>{if(!sourcePdf){showError("Upload a PDF first.");return;}$("numberingStep").dataset.unlocked="true";$("settingsStep").open=false;$("numberingStep").open=true;$("numberingStep").scrollIntoView({behavior:"smooth",block:"start"});});
  $("sheetSize").addEventListener("change",()=>{$("customFields").classList.toggle("hidden",$("sheetSize").value!=="custom"&&$("pageSize").value!=="custom");});
  $("pageSize").addEventListener("change",()=>{$("customFields").classList.toggle("hidden",$("sheetSize").value!=="custom"&&$("pageSize").value!=="custom");});
  $("numberingEnabled").addEventListener("change",()=>{$("numberStartPage").disabled=$("numberingEnabled").value!=="on";$("numberPlacement").disabled=$("numberingEnabled").value!=="on";$("numberFont").disabled=$("numberingEnabled").value!=="on";$("numberSize").disabled=$("numberingEnabled").value!=="on";});$("numberingEnabled").dispatchEvent(new Event("change"));
  $("previewSheet").addEventListener("change",drawPreview);
  $("frontBtn").addEventListener("click",()=>{currentSide="front";$("frontBtn").classList.add("active");$("backBtn").classList.remove("active");$("sideLabel").textContent="Front side";drawPreview();});
  $("backBtn").addEventListener("click",()=>{currentSide="back";$("backBtn").classList.add("active");$("frontBtn").classList.remove("active");$("sideLabel").textContent="Back side";drawPreview();});
  // Home screen navigation and information panels
  const homeScreen=$("homeScreen"), makerScreen=$("makerScreen"), overlay=$("infoOverlay");
  function showHome(){homeScreen.classList.remove("hidden");makerScreen.classList.add("hidden");$("appVersion").classList.remove("hidden");window.scrollTo({top:0,behavior:"smooth"});}
  function showMaker(){homeScreen.classList.add("hidden");makerScreen.classList.remove("hidden");$("appVersion").classList.add("hidden");window.scrollTo({top:0,behavior:"smooth"});}
  const aboutMarkup=`
    <p><strong>AutoBook</strong> means <strong>Automated Booklet Maker</strong>, a tool designed to turn PDF documents into booklet-ready printing layouts.</p>
    <p class="modal-tagline"><strong>Tagline:</strong> Booklet Printing Simplified</p>
    <h3>App Developers / Concept</h3>
    <ul class="team-list"><li>Ronell Robert G. Nicolas — Administrative Officer II</li><li>Vincent Jay L. Bergantin — Administrative Officer II</li></ul>
    <h3>Testers</h3>
    <ul class="team-list"><li>Rey B. Cantonjos — Administrative Officer II</li><li>Fermar R. Danao — Administrative Officer II</li></ul>
    <p><strong>Coding:</strong> ChatGPT</p>
    <p><strong>Developed by:</strong> San Fernando District ICT and ISM Team</p>
    <p><strong>Version:</strong> 1.0.2</p>
    <p><strong>2026 San Fernando District ICT and ISM Innovation.</strong></p>`;
  const changelogMarkup=`<div class="changelog-item"><div class="changelog-top"><span class="changelog-version">Version 1.0.2</span><span class="change-type minor">UI Update</span><span class="changelog-date">October 2026</span></div><ul><li>Replaces the misplaced print dropdown with a dedicated floating dialog consistent with the About panel, containing the two print actions.</li><li>Adds a Discover other SFD OneApps! panel linking to AutoTarp, keeping the discovery menu focused on the companion poster-making app.</li></ul></div>\n
    <div class="changelog-item"><div class="changelog-top"><span class="changelog-version">Version 1.0.1</span><span class="change-type minor">UI Hotfix</span><span class="changelog-date">October 2026</span></div><ul><li>Refines the Proceed to Print interaction so the print choices are presented in a compact floating panel instead of an awkwardly positioned inline menu.</li><li>Keeps the Download print-ready PDF and Open PDF for printing actions together in a clearer, easier-to-use menu.</li></ul></div>\n     <div class="changelog-item"><div class="changelog-top"><span class="changelog-version">Version 1.0.0</span><span class="change-type major">Major Update</span><span class="changelog-date">October 2026</span></div><ul><li>Adds multi-step undo/redo history for booklet setting changes, with Ctrl/⌘+Z and Ctrl/⌘+Y shortcuts.</li><li>Adds source page range selection and custom blank-page insertion before booklet imposition.</li><li>Adds local remembered preferences with a reset-to-default option.</li><li>Adds a printable test sheet with a 100 mm calibration line and duplex-check guidance.</li><li>Supports left-to-right and right-to-left booklet binding.</li><li>Improves workflow guidance and export checks for safer printing.</li></ul></div><div class="changelog-item"><div class="changelog-top"><span class="changelog-version">Beta 0.5.0</span><span class="change-type minor">Minor Update</span><span class="changelog-date">October 2026</span></div><ul><li>Introduces branded, larger numeric steppers for clearer adjustment in light and dark modes.</li><li>Fixes page-number placement around border designs and improves border rendering consistency.</li></ul></div><div class="changelog-item"><div class="changelog-top"><span class="changelog-version">Beta 0.4.0</span><span class="change-type major">Major Update</span><span class="changelog-date">October 2026</span></div><ul><li>Restores uploaded PDF thumbnail, file details, Remove Uploaded PDF, and Proceed to Booklet Settings actions.</li><li>Adds full-app dark mode with improved contrast for form controls, dropdowns, menus, and dialogs.</li><li>Reorganizes the workflow into four gated steps: PDF upload, booklet settings, page numbering and borders, and preview/export.</li><li>Adds colored or grayscale output; grayscale uses local raster conversion for compatibility.</li><li>Adds configurable page numbering start page, six placements, five font choices, and adjustable font size.</li><li>Adds border options: simple box, double line, dashed, dotted, decorative corners, heart-style dots, and smiley-style dots.</li><li>Adds Reset Settings and retains cache isolation from AutoTarp and SFD OneDirectory.</li></ul></div>
    <div class="changelog-item"><div class="changelog-top"><span class="changelog-version">Beta 0.3.0</span><span class="change-type major">Major Update</span><span class="changelog-date">October 2026</span></div><ul><li>Introduces the streamlined Booklet Setup workspace with numbered collapsible steps and a compact toolbar.</li><li>Adds Undo/Redo, help, and a bottom-positioned Proceed to Print menu.</li><li>Preserves local booklet imposition, preview, and PDF export.</li></ul></div>
    <div class="changelog-item"><div class="changelog-top"><span class="changelog-version">Beta 0.2.0</span><span class="change-type minor">Minor Update</span><span class="changelog-date">October 2026</span></div><ul><li>Redesigned the home screen to match AutoTarp’s compact light-mode layout.</li><li>Refined booklet navigation, feedback and version placement, About and Changelog panels, hero artwork, and district-branded footer.</li></ul></div>
    <div class="changelog-item"><div class="changelog-top"><span class="changelog-version">Beta 0.1.0</span><span class="change-type initial">Initial Release</span><span class="changelog-date">October 2026</span></div><ul><li>Introduces PDF upload, sheet and finished-page sizing, booklet imposition, front/back preview, and print-ready PDF export.</li><li>Processes documents locally in the browser.</li></ul></div>`;
  const appsMarkup=`<p class="apps-intro">Tools built to make San Fernando District workflows simpler.</p><div class="apps-grid single-app">
    <a class="app-card" href="https://sfdistrictdeped.github.io/autotarp/" target="_blank" rel="noopener"><img class="app-card-icon-img" src="./assets/icons/apps/autotarp.png" alt="AutoTarp app icon"><strong>AutoTarp</strong><span>Create and divide large posters into printable sheets.</span><em>Open AutoTarp ↗</em></a></div><div class="apps-footer"><strong>Developed and Maintained by San Fernando District ICT and ISM Team</strong><span>Under the SFD OneProgram</span></div>`;
  const printMarkup=`<div class="print-choice-list"><button type="button" class="print-choice" id="modalMenuDownload"><span class="print-choice-icon">↓</span><span><strong>Download print-ready PDF</strong><small>Save the generated booklet to your device.</small></span></button><button type="button" class="print-choice" id="modalMenuPrint"><span class="print-choice-icon">▣</span><span><strong>Open PDF for printing</strong><small>Open the generated PDF in your browser.</small></span></button></div>`;
  function openInfo(kind){const titles={about:"About AutoBook",changelog:"AutoBook Changelog",apps:"Discover other SFD OneApps!",print:"Proceed to Print"};$("modalTitle").textContent=titles[kind]||titles.about;$("modalContent").innerHTML=kind==="about"?aboutMarkup:kind==="changelog"?changelogMarkup:kind==="apps"?appsMarkup:printMarkup;overlay.classList.remove("hidden");$("closeModal").focus();if(kind==="print"){ $("modalMenuDownload").addEventListener("click",()=>{closeInfo();if(outputBytes)download();else if(!sourcePdf)showError("Upload a PDF and generate the booklet before exporting.");else showError("Generate the booklet PDF first, then export it here.");});$("modalMenuPrint").addEventListener("click",()=>{closeInfo();if(!outputBytes){showError("Generate the booklet PDF first, then open it for printing.");return;}const blob=new Blob([outputBytes],{type:"application/pdf"}),url=URL.createObjectURL(blob),win=window.open(url,"_blank");if(!win){showError("Your browser blocked the print window. Use Download print-ready PDF instead.");return;}win.addEventListener("load",()=>{try{win.focus();win.print();}catch(e){}},{once:true});setTimeout(()=>URL.revokeObjectURL(url),60000);});}}
  function closeInfo(){overlay.classList.add("hidden");}
  $("startBooklet").addEventListener("click",showMaker);
  $("homeNav").addEventListener("click",showHome);
  $("openAbout").addEventListener("click",()=>openInfo("about"));
  $("openApps").addEventListener("click",()=>openInfo("apps"));
  $("openChangelog").addEventListener("click",()=>openInfo("changelog"));
  $("closeModal").addEventListener("click",closeInfo);
  overlay.addEventListener("click",e=>{if(e.target===overlay)closeInfo();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeInfo();});

  // Branded, accessible number steppers. Native spinner controls are hidden in CSS.
  document.querySelectorAll('.workflow-content input[type="number"]').forEach(input => {
    if (input.closest('.number-control')) return;
    const wrapper = document.createElement('span');
    wrapper.className = 'number-control';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const controls = document.createElement('span');
    controls.className = 'number-stepper';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', `Adjust ${input.closest('label')?.childNodes?.[0]?.textContent?.trim() || input.id || 'value'}`);
    const makeButton = (direction, symbol, label) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = direction > 0 ? 'number-step-up' : 'number-step-down';
      button.textContent = symbol;
      button.setAttribute('aria-label', label);
      button.title = label;
      button.addEventListener('click', () => {
        if (input.disabled || input.readOnly) return;
        const before = input.value;
        if (direction > 0) input.stepUp(); else input.stepDown();
        if (input.value !== before) {
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        input.focus({ preventScroll: true });
      });
      return button;
    };
    controls.appendChild(makeButton(1, '▲', 'Increase value'));
    controls.appendChild(makeButton(-1, '▼', 'Decrease value'));
    wrapper.appendChild(controls);
  });

  // Booklet setup workspace: settings history, print menu, help, and theme.
  const settingIds=["sheetSize","pageSize","orientation","binding","scaling","colorMode","gutter","margin","sheetW","sheetH","pageW","pageH","pageRange","blankAfterPages","numberingEnabled","numberStartPage","numberPlacement","numberFont","numberSize","borderStyle","borderThickness","borderInset"];
  let undoStack=[],redoStack=[],lastState="";
  function getSettingsState(){return JSON.stringify(Object.fromEntries(settingIds.map(id=>[id,$(id)?.value??""])));}
  function syncHistoryButtons(){ $("undoBtn").disabled=!undoStack.length; $("redoBtn").disabled=!redoStack.length; }
  function saveHistory(){const next=getSettingsState();if(next!==lastState){if(lastState){undoStack.push(lastState);if(undoStack.length>60)undoStack.shift();redoStack=[];}lastState=next;syncHistoryButtons();try{localStorage.setItem("autobook-preferences-v1",next);}catch(e){}}}
  function restoreSettings(state){const obj=JSON.parse(state);for(const [id,value] of Object.entries(obj)){if($(id))$(id).value=value;}$("customFields").classList.toggle("hidden",$("sheetSize").value!=="custom"&&$("pageSize").value!=="custom");outputBytes=null;plan=null;$("results").classList.add("hidden");lastState=getSettingsState();syncHistoryButtons();}
  function undoSettings(){if(!undoStack.length)return;redoStack.push(getSettingsState());restoreSettings(undoStack.pop());}
  function redoSettings(){if(!redoStack.length)return;undoStack.push(getSettingsState());restoreSettings(redoStack.pop());}
  function invalidateGeneratedOutput(){outputBytes=null;plan=null;$("results").classList.add("hidden");}
  settingIds.forEach(id=>{const el=$(id);if(el){el.addEventListener("change",()=>{saveHistory();invalidateGeneratedOutput();});el.addEventListener("input",()=>{saveHistory();invalidateGeneratedOutput();});}});
  lastState=getSettingsState();syncHistoryButtons();
  $("undoBtn").addEventListener("click",undoSettings);$("redoBtn").addEventListener("click",redoSettings);
  $("proceedPrintBtn").addEventListener("click",()=>openInfo("print"));
  function setTheme(dark){document.body.classList.toggle("dark-mode",dark);const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=dark?"#151726":"#eef2ff";const label=dark?"☀️ Light mode":"🌙 Dark mode";[ $("themeToggle"),$("homeThemeToggle") ].forEach(b=>{if(b){b.textContent=label;b.setAttribute("aria-pressed",String(dark));}});try{localStorage.setItem("autobook-theme",dark?"dark":"light");}catch(e){}}
  let darkTheme=false;try{darkTheme=localStorage.getItem("autobook-theme")==="dark";}catch(e){}setTheme(darkTheme);
  [$("themeToggle"),$("homeThemeToggle")].forEach(b=>b?.addEventListener("click",()=>setTheme(!document.body.classList.contains("dark-mode"))));
  const helpOverlay=$("helpOverlay");
  function openHelp(){helpOverlay.classList.remove("hidden");$("closeHelp").focus();}
  function closeHelp(){helpOverlay.classList.add("hidden");}
  $("helpBtn").addEventListener("click",openHelp);$("closeHelp").addEventListener("click",closeHelp);helpOverlay.addEventListener("click",e=>{if(e.target===helpOverlay)closeHelp();});
  $("toolbarHome").addEventListener("click",showHome);
  document.addEventListener("keydown",e=>{const tag=e.target?.tagName?.toLowerCase();const typing=["input","textarea","select"].includes(tag)||e.target?.isContentEditable;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"&&!typing){e.preventDefault();undoSettings();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y"&&!typing){e.preventDefault();redoSettings();}else if(e.key==="Escape"){closeHelp();}else if(e.key==="?"&&!typing){openHelp();}});

  if("serviceWorker" in navigator && location.protocol!=="file:") window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>{}));
})();