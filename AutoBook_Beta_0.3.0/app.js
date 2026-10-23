/* AutoBook Beta 0.3.0 — client-side booklet imposition */
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
      margin:Math.max(0,Number($("margin").value)||0)*MM};
  }
  function validGeometry(s){
    const usableW=s.sheet[0]*MM-2*s.margin-s.gutter, usableH=s.sheet[1]*MM-2*s.margin;
    if(usableW<=0||usableH<=0)return false;
    // Fit proportionally may shrink pages to the available printable area; Actual size must fit as selected.
    return s.scaling==="fit" || (s.page[0]*MM<=usableW/2+1&&s.page[1]*MM<=usableH+1);
  }
  function pagePairs(count,binding){
    const padded=Math.ceil(count/4)*4, sheets=[];
    for(let i=0;i<padded/4;i++){
      let fl=padded-2*i, fr=1+2*i, bl=2+2*i, br=padded-1-2*i;
      if(binding==="rtl"){[fl,fr]=[fr,fl];[bl,br]=[br,bl];}
      sheets.push({front:[fl,fr],back:[bl,br]});
    }
    return {padded,sheets};
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
      $("fileInfo").innerHTML=`<div class="uploaded-preview"><div class="pdf-thumb-wrap"><canvas id="pdfThumbnail" aria-label="First page thumbnail of uploaded PDF"></canvas><span class="pdf-badge">PDF</span></div><div class="uploaded-file-details"><strong>${escapeHtml(file.name)}</strong><span>${pages} pages · ${formatBytes(file.size)}</span><span class="file-ready"><i></i> Ready to arrange</span></div></div><div class="uploaded-file-actions"><button type="button" id="removeUploadedPdf" class="secondary">Remove Uploaded PDF</button><button type="button" id="proceedSettings" class="primary">Proceed to Booklet Settings <span>→</span></button></div>`;
      $("fileInfo").classList.remove("hidden");$("dropzone").classList.add("hidden");$("generate").disabled=false;
      renderPdfThumbnail(buf).catch(()=>{});
      $("removeUploadedPdf").addEventListener("click",removeUploadedPdf);
      $("proceedSettings").addEventListener("click",()=>{$("uploadStep").open=false;$("settingsStep").open=true;$("settingsStep").scrollIntoView({behavior:"smooth",block:"start"});});
    }catch(e){sourceBytes=null;sourcePdf=null;$("generate").disabled=true;showError(e.message.includes("encrypted")?"This PDF appears to be password-protected. Please use an unlocked PDF.":"Could not read this PDF. It may be corrupt, encrypted, or unsupported. "+e.message);}
  }
  async function renderPdfThumbnail(bytes){
    if(!window.pdfjsLib)return;
    const task=pdfjsLib.getDocument({data:bytes.slice(0)}),pdf=await task.promise,page=await pdf.getPage(1);
    const base=page.getViewport({scale:1}),scale=Math.min(180/base.width,220/base.height),viewport=page.getViewport({scale});
    const canvas=$("pdfThumbnail");if(!canvas)return;canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;await pdf.destroy();
  }
  function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function formatBytes(n){return n<1024*1024?(n/1024).toFixed(0)+" KB":(n/1024/1024).toFixed(1)+" MB";}
  function mm(v){return v*MM;}
  async function generate(){
    clearError(); if(!sourcePdf)return;
    const s=settings();
    if(!validGeometry(s)){showError("These sheet and finished-page dimensions do not fit together with the current margins and gutter. Choose a larger sheet, smaller finished page, or reduce the margins.");return;}
    const btn=$("generate");btn.disabled=true;btn.textContent="Generating…";
    try{
      const {padded,sheets}=pagePairs(sourcePdf.getPageCount(),s.binding);
      const out=await PDFLib.PDFDocument.create();
      const embedded=[];
      for(let i=0;i<sourcePdf.getPageCount();i++) embedded.push(await out.embedPdf(sourceBytes,[i]).then(a=>a[0]));
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
        }
      }
      out.setTitle("AutoBook Booklet Output");out.setSubject("Booklet-imposed PDF generated locally by AutoBook Beta 0.3.0");
      outputBytes=await out.save();plan={s,padded,sheets,sourceCount:sourcePdf.getPageCount(),sheetW,sheetH};
      $("statPages").textContent=plan.sourceCount;$("statSheets").textContent=sheets.length;$("statBlanks").textContent=padded-plan.sourceCount;
      $("previewSheet").innerHTML=sheets.map((_,i)=>`<option value="${i}">Sheet ${i+1} of ${sheets.length}</option>`).join("");
      $("results").classList.remove("hidden");
      $("printNote").textContent=`Print ${sheets.length} sheets, double-sided, at 100% / Actual size. ${sheets.length*2} PDF pages represent front and back sides. ${padded-plan.sourceCount} blank page(s) were inserted where needed. Verify your printer's duplex flip-edge setting with a test copy.`;
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
          ctx.drawImage(temp,x+(w-temp.width)/2,y+(h-temp.height)/2);
          ctx.strokeStyle="#c5d2e4";ctx.strokeRect(x,y,w,h);
          await pdf.destroy();
        }catch(e){ctx.fillStyle="#a32d2d";ctx.font="12px sans-serif";ctx.fillText("Preview unavailable",x+8,y+20);}
      }else{
        ctx.fillStyle="#f4f7fb";ctx.fillRect(x,y,w,h);ctx.fillStyle="#9aa8ba";ctx.font="bold 14px sans-serif";ctx.textAlign="center";ctx.fillText("BLANK",x+w/2,y+h/2);ctx.textAlign="start";
      }
      ctx.fillStyle="#0878c5";ctx.font="bold 12px sans-serif";ctx.fillText(n>=1&&n<=plan.sourceCount?`Page ${n}`:"Blank page",x+8,y+17);
    }
  }
  function download(){
    if(!outputBytes)return;
    const blob=new Blob([outputBytes],{type:"application/pdf"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="AutoBook-Booklet.pdf";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function removeUploadedPdf(){
    sourceBytes=null;sourcePdf=null;outputBytes=null;plan=null;$("pdfFile").value="";$("fileInfo").classList.add("hidden");$("fileInfo").innerHTML="";$("dropzone").classList.remove("hidden");$("results").classList.add("hidden");$("generate").disabled=true;clearError();
  }
  function reset(){removeUploadedPdf();}
  function resetSettings(){
    const defaults={sheetSize:"A4",pageSize:"A5",orientation:"landscape",binding:"ltr",scaling:"fit",gutter:"4",margin:"6",sheetW:"297",sheetH:"210",pageW:"148",pageH:"210"};
    for(const [id,value] of Object.entries(defaults))$(id).value=value;
    $("customFields").classList.add("hidden");outputBytes=null;plan=null;$("results").classList.add("hidden");clearError();
    undoStack=[];redoStack=[];lastState=getSettingsState();syncHistoryButtons();
  }
  $("pdfFile").addEventListener("change",e=>loadFile(e.target.files[0]));
  const dz=$("dropzone");["dragenter","dragover"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add("dragging");}));
  ["dragleave","drop"].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove("dragging");}));
  dz.addEventListener("drop",e=>loadFile(e.dataTransfer.files[0]));
  $("generate").addEventListener("click",generate);$("reset").addEventListener("click",reset);$("resetSettings").addEventListener("click",resetSettings);
  $("sheetSize").addEventListener("change",()=>{$("customFields").classList.toggle("hidden",$("sheetSize").value!=="custom"&&$("pageSize").value!=="custom");});
  $("pageSize").addEventListener("change",()=>{$("customFields").classList.toggle("hidden",$("sheetSize").value!=="custom"&&$("pageSize").value!=="custom");});
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
    <p><strong>Version:</strong> 0.3.0</p>
    <p><strong>2026 San Fernando District ICT and ISM Innovation.</strong></p>`;
  const changelogMarkup=`
    <div class="changelog-item"><div class="changelog-top"><span class="changelog-version">Beta 0.3.0</span><span class="change-type major">Major Update</span><span class="changelog-date">October 2026</span></div><p>Introduces a streamlined Booklet Setup workspace inspired by AutoTarp: numbered collapsible steps, a compact toolbar with Undo/Redo and help, a bottom-positioned Proceed to Print menu with download and in-browser printing options, and a clearer preview/export workflow. Dark mode is deferred. Adds practical print guidance and keyboard shortcuts while preserving the existing booklet imposition and local PDF processing.</p></div>
    <div class="changelog-item"><div class="changelog-top"><span class="changelog-version">Beta 0.2.0</span><span class="change-type minor">Minor Update</span><span class="changelog-date">October 2026</span></div><p>Redesigned the home screen to match AutoTarp’s compact light-mode layout; refined booklet navigation, feedback and version placement, light-mode About and Changelog panels, transparent hero artwork, and the district-branded footer.</p></div>
    <div class="changelog-item"><div class="changelog-top"><span class="changelog-version">Beta 0.1.0</span><span class="change-type initial">Initial Release</span><span class="changelog-date">October 2026</span></div><p>Initial AutoBook beta release with PDF upload, sheet and finished-page size selection, booklet imposition, front/back preview, and print-ready PDF export. Files are processed locally in the browser.</p></div>`;
  function openInfo(kind){$("modalTitle").textContent=kind==="about"?"About AutoBook":"AutoBook Changelog";$("modalContent").innerHTML=kind==="about"?aboutMarkup:changelogMarkup;overlay.classList.remove("hidden");$("closeModal").focus();}
  function closeInfo(){overlay.classList.add("hidden");}
  $("startBooklet").addEventListener("click",showMaker);
  $("homeNav").addEventListener("click",showHome);
  $("openAbout").addEventListener("click",()=>openInfo("about"));
  $("openChangelog").addEventListener("click",()=>openInfo("changelog"));
  $("closeModal").addEventListener("click",closeInfo);
  overlay.addEventListener("click",e=>{if(e.target===overlay)closeInfo();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeInfo();});

  // Booklet setup workspace: settings history, print menu, help, and theme.
  const settingIds=["sheetSize","pageSize","orientation","binding","scaling","gutter","margin","sheetW","sheetH","pageW","pageH"];
  let undoStack=[],redoStack=[],lastState="";
  function getSettingsState(){return JSON.stringify(Object.fromEntries(settingIds.map(id=>[id,$(id)?.value??""])));}
  function syncHistoryButtons(){ $("undoBtn").disabled=!undoStack.length; $("redoBtn").disabled=!redoStack.length; }
  function saveHistory(){const next=getSettingsState();if(next!==lastState){if(lastState){undoStack.push(lastState);if(undoStack.length>60)undoStack.shift();redoStack=[];}lastState=next;syncHistoryButtons();}}
  function restoreSettings(state){const obj=JSON.parse(state);for(const [id,value] of Object.entries(obj)){if($(id))$(id).value=value;}$("customFields").classList.toggle("hidden",$("sheetSize").value!=="custom"&&$("pageSize").value!=="custom");outputBytes=null;plan=null;$("results").classList.add("hidden");lastState=getSettingsState();syncHistoryButtons();}
  function undoSettings(){if(!undoStack.length)return;redoStack.push(getSettingsState());restoreSettings(undoStack.pop());}
  function redoSettings(){if(!redoStack.length)return;undoStack.push(getSettingsState());restoreSettings(redoStack.pop());}
  settingIds.forEach(id=>{const el=$(id);if(el){el.addEventListener("change",saveHistory);el.addEventListener("input",saveHistory);}});
  lastState=getSettingsState();syncHistoryButtons();
  $("undoBtn").addEventListener("click",undoSettings);$("redoBtn").addEventListener("click",redoSettings);
  const printOverlay=$("printOverlay");
  function openPrintOptions(){if(!outputBytes){showError("Generate the booklet PDF first, then choose a print option.");return;}printOverlay.classList.remove("hidden");$("closePrint").focus();}
  function closePrintOptions(){printOverlay.classList.add("hidden");}
  $("proceedPrintBtn").addEventListener("click",openPrintOptions);
  $("closePrint").addEventListener("click",closePrintOptions);
  printOverlay.addEventListener("click",e=>{if(e.target===printOverlay)closePrintOptions();});
  $("menuDownload").addEventListener("click",()=>{closePrintOptions();if(outputBytes)download();else showError("Generate the booklet PDF first, then export it here.");});
  $("menuPrint").addEventListener("click",()=>{closePrintOptions();if(!outputBytes){showError("Generate the booklet PDF first, then open it for printing.");return;}const blob=new Blob([outputBytes],{type:"application/pdf"}),url=URL.createObjectURL(blob),win=window.open(url,"_blank");if(!win){showError("Your browser blocked the print window. Use Download print-ready PDF instead.");return;}win.addEventListener("load",()=>{try{win.focus();win.print();}catch(e){}},{once:true});setTimeout(()=>URL.revokeObjectURL(url),60000);});
  const helpOverlay=$("helpOverlay");
  function openHelp(){helpOverlay.classList.remove("hidden");$("closeHelp").focus();}
  function closeHelp(){helpOverlay.classList.add("hidden");}
  $("helpBtn").addEventListener("click",openHelp);$("closeHelp").addEventListener("click",closeHelp);helpOverlay.addEventListener("click",e=>{if(e.target===helpOverlay)closeHelp();});
  $("toolbarHome").addEventListener("click",showHome);
  document.addEventListener("keydown",e=>{const tag=e.target?.tagName?.toLowerCase();const typing=["input","textarea","select"].includes(tag)||e.target?.isContentEditable;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"&&!typing){e.preventDefault();undoSettings();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y"&&!typing){e.preventDefault();redoSettings();}else if(e.key==="Escape"){closeHelp();closePrintOptions();}else if(e.key==="?"&&!typing){openHelp();}});

  if("serviceWorker" in navigator && location.protocol!=="file:") window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(()=>{}));
})();