import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { ALL_TOOLS } from "./tools.js";

const VERSION = "0.1.0";
const PORT = Number(process.env.PORT || 10000);
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const ADAPTER_SECRET = (process.env.NBB_ADAPTER_SECRET || "").trim();
const LIVE_VOICE = (process.env.LIVE_VOICE || "ripple").trim();
const BACKEND_MODEL = (process.env.BACKEND_MODEL || "gpt-6-luna").trim();
const TEST_SITE_HOST = (process.env.NBB_TEST_SITE_HOST || "carpetcleaningannarbor.com").trim().toLowerCase();
const LOG_TRANSCRIPTS = (process.env.LOG_TRANSCRIPTS || "1") !== "0";

if (!OPENAI_API_KEY) console.error("OPENAI_API_KEY is missing.");
if (!ADAPTER_SECRET) console.error("NBB_ADAPTER_SECRET is missing.");

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, {"content-type":"application/json"});
    res.end(JSON.stringify({
      ok:true,
      service:"nbb-gpt-live-ripple-test-relay",
      version:VERSION,
      voice:LIVE_VOICE,
      backend:BACKEND_MODEL,
      test_site_host:TEST_SITE_HOST,
    }));
    return;
  }
  res.writeHead(404, {"content-type":"text/plain"});
  res.end("Not found");
});

const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  const path = (req.url || "").split("?")[0];
  if (path !== "/twilio/live") { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
});

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
function cloneObject(v) { return v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : {}; }
function normalizedText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
}
function normalizePhone(v) {
  const raw=String(v||"").trim(), d=raw.replace(/\D+/g,"");
  if (!d) return "";
  if (d.length===10) return "+1"+d;
  if (d.length===11 && d[0]==="1") return "+"+d;
  if (raw.startsWith("+") && d.length>=8 && d.length<=15) return "+"+d;
  return d ? "+"+d : "";
}
function normalizedEmail(value) { return String(value || "").trim().toLowerCase(); }
function normalizeEstimateDelivery(value) {
  const t=normalizedText(value);
  if (["sms","text","text message"].includes(t)) return "sms";
  if (["email","e mail"].includes(t)) return "email";
  if (["both","sms and email","email and sms","text and email","email and text"].includes(t)) return "both";
  return "";
}
function spokenEmail(value) {
  return normalizedEmail(value)
    .replace(/@/g," at ")
    .replace(/\./g," dot ")
    .replace(/_/g," underscore ")
    .replace(/-/g," dash ")
    .replace(/\+/g," plus ")
    .replace(/\s+/g," ")
    .trim();
}
function confirmationIntent(text) {
  const t=normalizedText(text);
  if (!t) return null;
  const negative=[
    /\b(?:no|nope|nah)\b/,/\b(?:incorrect|wrong)\b/,/\bnot\s+(?:correct|right|that one|it)\b/,
    /\b(?:isn't|isnt|wasn't|wasnt)\s+(?:correct|right)\b/,/\b(?:wait|hold on|hang on)\b/,
    /\b(?:i )?(?:misspoke|mis spoke)\b/,
    /\b(?:change|correct|update|edit|fix)\s+(?:it|that|the\s+)?(?:phone(?: number)?|number|email(?: address)?|address|date|time|name|service|services|details?|appointment)\b/,
    /\b(?:make|use)\s+(?:it|that)?\s*(?:a\s+)?different\s+(?:number|email|address|time|date|name|service)\b/,
    /\b(?:different|another)\s+(?:number|email|address|time|date|name|service)\b/,/\bnot\s+yet\b/,
    /\b(?:do not|don't)\s+(?:book|schedule|confirm|use)\b/,/\bcancel\s+(?:that|it)\b/
  ];
  if (negative.some(p=>p.test(t))) return false;
  const ambiguous=[/\b(?:not sure|unsure|maybe|perhaps)\b/,/\b(?:i do not know|i don't know|i dunno)\b/,/\b(?:could you|can you|please)\s+repeat\b/,/\bwhat did you say\b/];
  if (ambiguous.some(p=>p.test(t))) return null;
  const affirmative=[
    /\b(?:yes|yeah|yep|yup|sure|absolutely|affirmative|exactly|ok|okay|alright)\b/,/\b(?:correct|confirmed)\b/,
    /\b(?:right|perfect)\b/,/\b(?:uh huh|uhuh|mhm|mm hmm|mmhm)\b/,/\byou got it\b/,
    /\b(?:that|this|it)\s+(?:is|sounds|looks)\s+(?:correct|right|good|perfect)\b/,
    /\b(?:that's|thats)\s+(?:correct|right|good|perfect|it|the one)\b/,/\bsounds\s+(?:correct|right|good)\b/,
    /\b(?:that|it)\s+works(?:\s+for\s+me)?\b/,/\b(?:works for me|that's fine|thats fine|all good)\b/,
    /\b(?:go ahead|book it|schedule it|confirm it|do it)\b/,/\bplease\s+(?:book|schedule|confirm)\s+it\b/
  ];
  if (affirmative.some(p=>p.test(t))) return true;
  return null;
}
function asksForTextMessage(text) {
  const t=normalizedText(text); if (!t) return false;
  if (["don't text","do not text","dont text","no text","not by text","not text","don't sms","do not sms","dont sms","no sms","not by sms"].some(p=>t.includes(p))) return false;
  if (["text","sms","text message","by text","by sms","via text","via sms"].includes(t)) return true;
  if (["text me","send me a text","send that by text","send it by text","send by text","send by sms","send me that in a text","sms me","send me an sms","text that to me","can you text","could you text","by text","via text","by sms","via sms","text please","sms please"].some(p=>t.includes(p))) return true;
  const words=t.split(" ").filter(Boolean); return words.length<=8 && (words.includes("text")||words.includes("sms"));
}
function asksForEmailMessage(text) {
  const t=normalizedText(text); if (!t) return false;
  if (["don't email","do not email","dont email","no email","not by email","not email","don't e mail","do not e mail","not by e mail"].some(p=>t.includes(p))) return false;
  if (["email","e mail","by email","by e mail","via email","via e mail"].includes(t)) return true;
  if (["email me","send me an email","send that by email","send it by email","send by email","send that to my email","email that to me","can you email","could you email","by email","via email","email please"].some(p=>t.includes(p))) return true;
  const words=t.split(" ").filter(Boolean); return words.length<=8 && (words.includes("email") || (words.includes("e")&&words.includes("mail")));
}
function explicitEstimateDeliveryChoice(text) {
  const t=normalizedText(text); if (!t) return "";
  const sms=asksForTextMessage(text), email=asksForEmailMessage(text);
  if ((sms&&email) || t==="both") return "both";
  if (sms) return "sms";
  if (email) return "email";
  return "";
}
function explicitWorkflowIntent(text) {
  const t=normalizedText(text); if (!t) return "";
  if (/\b(?:reschedule|re schedule)\b/.test(t) || /\b(?:move|change)\b.*\b(?:appointment|booking)\b/.test(t) || /\b(?:appointment|booking)\b.*\b(?:move|change)\b/.test(t)) return "reschedule";
  if (/\b(?:cancel|cancellation)\b.*\b(?:appointment|booking)\b/.test(t) || /\b(?:appointment|booking)\b.*\b(?:cancel|cancellation)\b/.test(t)) return "cancel";
  if ([
    /\b(?:schedule|book)\b.*\b(?:cleaning|service|appointment|job|visit|carpet|upholstery|vent|couch|sofa|sectional|stair|tile|rug|detail|detailing|pressure washing)\b/,
    /\b(?:make|set up|setup|arrange)\b.*\b(?:an? )?appointment\b/,
    /\b(?:i|we) (?:want|need|would like|would love)\b.*\b(?:schedule|book|appointment)\b/,
    /\b(?:can|could|would) (?:i|we)\b.*\b(?:schedule|book)\b/,/\b(?:ready|want|need) to (?:schedule|book)\b/,
    /\b(?:schedule|book)\s+(?:it|this|that|the estimate|the quote)\b/
  ].some(p=>p.test(t))) return "booking";
  if ([/\b(?:quote|estimate)\b/,/\bhow much\b/,/\b(?:what|how much).*(?:cost|price|charge)\b/,/\b(?:cost|price)\b.*\b(?:service|cleaning|job|it|that|this)\b/].some(p=>p.test(t))) return "estimate";
  return "";
}
function explicitlySwitchesToEstimateOnly(text) {
  const t=normalizedText(text); if (!t || !/\b(?:quote|estimate|price|cost)\b/.test(t)) return false;
  return /\b(?:instead|only|just)\b/.test(t) || /\b(?:do not|don't|dont|not)\b.*\b(?:schedule|book|appointment)\b/.test(t) || /\b(?:forget|stop)\b.*\b(?:schedule|booking|appointment)\b/.test(t);
}
function isNoMoreServicesReply(text) {
  const t=normalizedText(text); if (!t) return false;
  const add=[
    /\b(?:but|however|except|besides)\b.*\b(?:add|also|need|want|include|clean|cleaning|service|treatment)\b/,
    /\b(?:actually|also|and)\b.*\b(?:add|need|want|include|clean|cleaning)\b/,
    /\b(?:add|include)\b.*\b(?:another|one more|service|cleaning|cleaned|treatment|vent|carpet|upholstery|couch|sofa|sectional|stair|tile|rug|detail)/,
    /\b(?:also need|also want|need another|want another|another service|one more thing|one more service)\b/,
    /\b(?:change|switch|replace)\b.*\b(?:service|cleaning|treatment|to|with)\b/
  ];
  if (add.some(p=>p.test(t))) return false;
  if (/\b(?:don't|dont|do not) think (?:that(?:'| )?s|that is) (?:all|it|everything)\b/.test(t) || /\b(?:not done|not finished|not all set)\b/.test(t)) return false;
  if (/\b(?:no|nope|nah)\b/.test(t) || /^(?:none|nothing|nothing else|nothing more|none else|none more)$/.test(t)) return true;
  return [
    /\b(?:i am|i(?:'| )?m|we are|we(?:'| )?re) (?:all )?(?:set|done|good|finished)\b/,/\b(?:all set|all done|we(?:'| )?re good|i(?:'| )?m good)\b/,
    /\b(?:that|this) (?:will|would|should) do(?: it)?\b/,/\bthat(?:'| )?ll do(?: it)?\b/,/\b(?:that(?:'| )?s|that is) (?:all|it|everything|enough)\b/,
    /\b(?:nothing|none) else\b/,/\bno more (?:service|services|cleaning|cleanings|things|anything)\b/,
    /\b(?:don't|dont|do not) (?:need|want) (?:anything|anything else|anything more|more|another service|any other services?)\b/,
    /\b(?:just|please|go ahead and|let's|lets) (?:move on|continue|proceed)\b/,/\b(?:let's|lets|go ahead and|just|please) (?:schedule|book)\b/,
    /\bready to (?:schedule|book|continue|proceed|move on)\b/
  ].some(p=>p.test(t));
}
function isExplicitServiceAdditionOrChange(text) {
  const t=normalizedText(text); if (!t) return false;
  return [
    /\b(?:add|include)\b.*\b(?:service|cleaning|treatment|vent|carpet|upholstery|couch|sofa|sectional|stair|tile|rug|protector|enzyme)\b/,
    /\b(?:also need|also want|need another|want another|one more service|one more thing)\b/,
    /\b(?:change|switch|replace|remove)\b.*\b(?:service|cleaning|treatment|vent|carpet|upholstery|couch|sofa|sectional|stair|tile|rug|protector|enzyme)\b/,
    /\b(?:can we|could we|i want to|i need to|i would like to|i'd like to)\b.*\b(?:add|include|change|remove)\b/
  ].some(p=>p.test(t));
}
function isAdditionalServiceQuestion(text) {
  const t=normalizedText(text); if (!t) return false;
  return ["add any other service","add any other services","add another service","any other service","any other services","anything else you would like cleaned","anything else youd like cleaned","anything else you want cleaned","would you like anything else","do you need anything else cleaned"].some(p=>t.includes(p));
}
function serviceRowsSignature(args={}) {
  if (!Array.isArray(args?.services)) return "";
  const rows=args.services.map(r=>({service_uuid:String(r?.service_uuid||"").trim(),quantity:Number(r?.quantity||0)}))
    .filter(r=>r.service_uuid&&Number.isFinite(r.quantity)&&r.quantity>0)
    .sort((a,b)=>a.service_uuid.localeCompare(b.service_uuid)||a.quantity-b.quantity);
  return rows.length ? JSON.stringify(rows) : "";
}
async function postJson(url, body) {
  const r = await fetch(url, {
    method:"POST",
    headers:{"content-type":"application/json","accept":"application/json","x-nbb-gpt-live-test-secret":ADAPTER_SECRET},
    body:JSON.stringify(body),
  });
  const text=await r.text();
  let data; try{data=JSON.parse(text);}catch{data={message:text};}
  if(!r.ok){const e=new Error(data?.message||data?.error||`HTTP ${r.status}`);e.status=r.status;e.data=data;throw e;}
  return data;
}

function filterTools(c={}) {
  const names=new Set(["nbb_get_business_context","nbb_request_callback"]);
  if(c.business_questions) names.add("nbb_answer_business_question");
  if(c.availability||c.booking){names.add("nbb_validate_address");names.add("nbb_get_availability");}
  if(c.quotes) names.add("nbb_get_quote");
  if(c.estimate_lookup) names.add("nbb_lookup_estimate");
  if(c.booking){names.add("voice_set_booking_phone");names.add("nbb_prepare_booking");names.add("nbb_commit_booking");}
  if(c.booking&&c.booking_notes) names.add("voice_set_booking_notes");
  if(c.reschedule||c.cancel) names.add("nbb_lookup_existing_booking");
  if(c.reschedule){names.add("nbb_get_reschedule_availability");names.add("nbb_submit_reschedule_request");}
  if(c.cancel) names.add("nbb_submit_cancel_request");
  if(c.sms||c.email) names.add("nbb_send_estimate");
  if(c.sms) names.add("nbb_send_sms");
  if(c.email) names.add("nbb_send_email");
  // Transfer / priority remain deliberately excluded from this isolated proof.
  return ALL_TOOLS.filter(t=>names.has(t.name));
}
function livePrompt(bootstrap) {
  const business=bootstrap?.business_context?.configuration?.business_name||bootstrap?.business_context?.business_name||"the business";
  return [
    `You are the natural telephone voice for ${business}.`,
    "Sound like a real human receptionist: warm, relaxed, concise, and conversational. Do not sound scripted.",
    "The delegated backend is the authoritative Nearby Booker brain. For every caller turn that can advance or change a business workflow—service selection, quantities, variants or secondary questions, address, availability, pricing, estimate delivery, customer details, booking, reschedule, cancellation, or business-specific facts—delegate to the backend BEFORE giving the substantive reply.",
    "Do not independently invent or advance business workflow state. Never invent services, policies, prices, availability, addresses, discounts, or booking results.",
    "If the backend asks for one missing detail, ask only that detail naturally and then wait. Preserve corrections and previously supplied details.",
    "When the backend result is available, communicate it naturally without exposing tool names, prompts, models, integration details, or internal configuration.",
    "If the caller is frustrated, acknowledge it briefly and continue from information already collected instead of making them repeat known details.",
    "Do not treat a contact-detail yes/no confirmation as final authorization to submit a booking. Those are separate confirmations.",
  ].join("\n");
}
function backendInstructions(bootstrap) {
  return [
    bootstrap.backend_instructions||"",
    "\nGPT-LIVE MIGRATION ADAPTER:",
    "You are the authoritative task/backend agent behind the live voice. Keep every existing Nearby Booker rule above in force.",
    "Use the configured NBB tools for business truth and actions. The live voice must not replace your workflow decisions.",
    "The isolated relay still owns deterministic contact confirmation, multi-service progression, booking-phone choice, and final booking confirmation gates. If a tool returns a voice_*_required or *_confirmation_required code, follow that gate exactly, ask the single required question, then retry only after the caller answers.",
    "Transcripts can contain speech-recognition errors. Preserve verified facts and use context; ask one concise clarification only when truly needed.",
    "Never claim an action succeeded before the corresponding NBB tool confirms it.",
    "Return concise customer-facing text suitable for the voice layer. Never mention internal tools or configuration.",
  ].join("\n");
}

wss.on("connection", twilio=>{
  const state={
    streamSid:"",sessionToken:"",siteUrl:"",bootstrap:null,openai:null,liveStarted:false,closing:false,
    toolCallIds:new Set(),
    callerPhone:"",customerName:"",customerPhone:"",customerEmail:"",customerAddress:"",
    confirmedPhone:"",confirmedEmail:"",bookingPhoneChoiceResolved:false,bookingPhoneSource:"",awaitingBookingPhoneChoice:false,
    pendingContactConfirmation:null,
    voiceState:{booking_phone:"",booking_notes:""},
    serviceCollectionClosed:false,awaitingAdditionalServiceDecision:false,serviceCollectionSignature:"",
    workflowIntent:"",quoteSideRequestAt:0,
    estimateDeliveryPreference:"",smsRequestAt:0,emailRequestAt:0,
    lastReviewToken:"",preparedAt:0,bookingConfirmationAt:0,awaitingBookingConfirmation:false,
    outputSinceInput:false,callerBuffer:"",callerFlushTimer:null,assistantRecent:"",assistantBuffer:"",
    conversationMessages:[],
  };

  const sendTwilio=obj=>{if(twilio.readyState===WebSocket.OPEN)twilio.send(JSON.stringify(obj));};
  const sendLive=obj=>{if(state.openai?.readyState===WebSocket.OPEN)state.openai.send(JSON.stringify(obj));};
  const appendLiveInstruction=content=>{
    const text=String(content||"").trim(); if(!text)return;
    sendLive({type:"session.instructions.append",event_id:`state_${Date.now()}_${Math.random().toString(16).slice(2,8)}`,delegation_id:null,content:text.slice(0,1800)});
  };

  function updateWorkflowIntent(text){
    const detected=explicitWorkflowIntent(text); if(!detected)return;
    if(state.workflowIntent==="booking"&&detected==="estimate"&&!explicitlySwitchesToEstimateOnly(text)){
      state.quoteSideRequestAt=Date.now(); return;
    }
    if(state.workflowIntent!==detected){state.workflowIntent=detected;if(detected!=="booking")state.quoteSideRequestAt=0;}
  }
  function pushConversationMessage(role,content){
    const text=String(content||"").trim(); if(!text)return;
    state.conversationMessages.push({role,content:text.slice(0,2000)});
    if(state.conversationMessages.length>40)state.conversationMessages=state.conversationMessages.slice(-40);
  }
  function flushAssistantBuffer(){
    const text=String(state.assistantBuffer||"").trim();
    state.assistantBuffer="";
    if(text)pushConversationMessage("assistant",text);
  }

  function processCallerText(text){
    const transcript=String(text||"").trim(); if(!transcript)return;
    pushConversationMessage("user",transcript);
    updateWorkflowIntent(transcript);
    const explicitDelivery=explicitEstimateDeliveryChoice(transcript);
    if(!state.estimateDeliveryPreference&&explicitDelivery)state.estimateDeliveryPreference=explicitDelivery;
    const norm=normalizedText(transcript);
    if(asksForTextMessage(transcript)||norm==="both")state.smsRequestAt=Date.now();
    if(asksForEmailMessage(transcript)||norm==="both")state.emailRequestAt=Date.now();

    if(state.serviceCollectionClosed&&isExplicitServiceAdditionOrChange(transcript)){
      state.serviceCollectionClosed=false;state.serviceCollectionSignature="";state.awaitingAdditionalServiceDecision=false;
    }
    if(state.awaitingAdditionalServiceDecision){
      state.awaitingAdditionalServiceDecision=false;
      if(isNoMoreServicesReply(transcript)){
        state.serviceCollectionClosed=true;
        appendLiveInstruction("The caller just said they do not want any additional services. Service collection is closed. Do not ask about additional services again unless the caller later adds or changes a service. Continue the caller's existing goal with the next single missing item.");
      } else {
        state.serviceCollectionClosed=false;
      }
    }

    let consumedContact=false;
    if(state.pendingContactConfirmation){
      const pending=state.pendingContactConfirmation;
      const intent=confirmationIntent(transcript);
      if(intent===true){
        consumedContact=true;
        if(pending.type==="email"){
          state.customerEmail=normalizedEmail(pending.value);state.confirmedEmail=state.customerEmail;
        }else if(pending.type==="phone"){
          state.customerPhone=normalizePhone(pending.value);state.confirmedPhone=state.customerPhone;
          if(pending.context==="booking_phone"){
            state.bookingPhoneChoiceResolved=true;state.bookingPhoneSource=state.confirmedPhone===state.callerPhone?"caller":"alternate";state.awaitingBookingPhoneChoice=false;
            state.voiceState.booking_phone=state.confirmedPhone;
          }
        }
        state.pendingContactConfirmation=null;
        appendLiveInstruction(`The caller just confirmed the ${pending.type}. It is locked for this call. Do not ask them to confirm it again. Delegate and continue the pending workflow with the next missing item.`);
      } else if(intent===false){
        consumedContact=true;
        state.pendingContactConfirmation=null;
        if(pending.type==="email"){state.customerEmail="";state.confirmedEmail="";}
        if(pending.type==="phone"){
          state.customerPhone="";state.confirmedPhone="";state.voiceState.booking_phone="";
          if(pending.context==="booking_phone"){state.bookingPhoneChoiceResolved=false;state.bookingPhoneSource="alternate";state.awaitingBookingPhoneChoice=false;}
        }
        appendLiveInstruction(`The caller rejected the captured ${pending.type}. Ask only for the corrected ${pending.type} next; do not reuse the rejected value.`);
      }
    }
    if(!consumedContact&&state.awaitingBookingConfirmation){
      const intent=confirmationIntent(transcript);
      if(intent===true)state.bookingConfirmationAt=Date.now();
      else if(intent===false)state.bookingConfirmationAt=0;
    }
  }
  function flushCallerBuffer(){
    if(state.callerFlushTimer){clearTimeout(state.callerFlushTimer);state.callerFlushTimer=null;}
    const text=state.callerBuffer.trim();state.callerBuffer="";
    if(text)processCallerText(text);
  }
  function scheduleCallerFlush(){
    if(state.callerFlushTimer)clearTimeout(state.callerFlushTimer);
    // GPT-Live has transcript deltas but no turn-done event. Delegation.created
    // flushes immediately; this is only a fallback for a non-delegated turn.
    state.callerFlushTimer=setTimeout(flushCallerBuffer,1400);
  }
  function processAssistantDelta(delta){
    state.assistantBuffer+=String(delta||"");
    state.assistantRecent=(state.assistantRecent+String(delta||"")).slice(-1200);
    if(!state.serviceCollectionClosed&&isAdditionalServiceQuestion(state.assistantRecent))state.awaitingAdditionalServiceDecision=true;
  }

  async function startLive(){
    const u=new URL(state.siteUrl);
    if(u.protocol!=="https:"||u.hostname.toLowerCase()!==TEST_SITE_HOST)throw new Error(`Test adapter host must be ${TEST_SITE_HOST}.`);
    const base=state.siteUrl.replace(/\/+$/,"");
    state.bootstrap=await postJson(base+"/wp-json/nbb-gpt-live-test/v1/bootstrap",{session_token:state.sessionToken});
    state.callerPhone=normalizePhone(state.bootstrap?.session?.caller_phone);
    const tools=filterTools(state.bootstrap.capabilities||{});
    const ws=new WebSocket("wss://api.openai.com/v1/live/sessions",{headers:{Authorization:`Bearer ${OPENAI_API_KEY}`}});
    state.openai=ws;
    ws.on("open",()=>{
      ws.send(JSON.stringify({
        type:"session.start",event_id:"nbb_live_start",
        session:{
          model:"gpt-live-1",
          instructions:livePrompt(state.bootstrap),
          audio:{format:{type:"audio/pcmu",rate:8000},output:{voice:LIVE_VOICE}},
          delegation:{type:"responses",responses:{model:BACKEND_MODEL,instructions:backendInstructions(state.bootstrap),tools,tool_choice:"auto",parallel_tool_calls:false}}
        }
      }));
    });

    ws.on("message",async raw=>{
      const evt=safeJson(raw.toString()); if(!evt)return;
      try{
        if(evt.type==="session.started"){
          state.liveStarted=true;
          console.log("GPT-Live started",evt.session?.id||"","voice",LIVE_VOICE,"tools",tools.length);
          const greeting=String(state.bootstrap.opening_greeting||"").trim();
          if(greeting){
            sendLive({
              type:"session.instructions.append",event_id:"opening_greeting",delegation_id:null,
              content:`Greet the caller now using this business greeting naturally: ${JSON.stringify(greeting)}. Then stop speaking and listen for the caller.`
            });
          }
          return;
        }
        if(evt.type==="session.output_audio.delta"&&evt.delta){
          state.outputSinceInput=true;
          sendTwilio({event:"media",streamSid:state.streamSid,media:{payload:evt.delta}});return;
        }
        if(evt.type==="session.input_transcript.delta"&&evt.delta){
          if(state.assistantBuffer)flushAssistantBuffer();
          if(state.outputSinceInput&&state.streamSid){sendTwilio({event:"clear",streamSid:state.streamSid});state.outputSinceInput=false;}
          state.callerBuffer+=evt.delta;scheduleCallerFlush();
          if(LOG_TRANSCRIPTS)process.stdout.write(`[caller] ${evt.delta}`);return;
        }
        if(evt.type==="session.output_transcript.delta"&&evt.delta){
          processAssistantDelta(evt.delta);
          if(LOG_TRANSCRIPTS)process.stdout.write(`[agent] ${evt.delta}`);return;
        }
        if(evt.type==="session.delegation.created"){
          // This event normally follows a caller turn. Flush transcript state
          // before the delegated backend starts making progression decisions.
          flushCallerBuffer();return;
        }
        if(evt.type==="response.event"&&evt.event?.type==="response.output_item.done"){
          const item=evt.event.item;
          if(!item||item.type!=="function_call"||!item.call_id||!item.name)return;
          if(state.toolCallIds.has(item.call_id))return;
          state.toolCallIds.add(item.call_id);
          const args=safeJson(item.arguments||"{}")||{};
          const result=await executeTool(item.name,args);
          sendLive({type:"response.item.create",event_id:`tool_result_${item.call_id}`,item:{type:"function_call_output",call_id:item.call_id,output:JSON.stringify(result)}});
          sendLive({type:"response.create",event_id:`continue_${item.call_id}`});return;
        }
        if(evt.type==="error"){console.error("GPT-Live error",JSON.stringify(evt));return;}
        if(evt.type==="session.closed"){
          console.log("GPT-Live closed",JSON.stringify(evt.usage||{}));if(twilio.readyState===WebSocket.OPEN)twilio.close();return;
        }
      }catch(e){console.error("Live event handler failed",e?.stack||e);}
    });
    ws.on("error",e=>console.error("OpenAI Live socket error",e?.message||e));
    ws.on("close",(code,reason)=>{console.log("OpenAI Live socket closed",code,String(reason||""));if(!state.closing&&twilio.readyState===WebSocket.OPEN)twilio.close();});
  }

  function contactGateResult(type,value,context=""){
    state.pendingContactConfirmation={type,value,context};
    if(type==="email")return {success:false,code:"voice_email_confirmation_required",message:`Confirm the email exactly once: I have ${spokenEmail(value)}. Is that correct? Do not retry until the caller answers.`};
    return {success:false,code:"voice_phone_confirmation_required",message:`Read back this phone number exactly once: ${value}. Ask if it is correct, then wait. Do not retry until the caller answers.`};
  }
  function mergeKnownCustomer(toolArgs){
    if(!toolArgs.customer||typeof toolArgs.customer!=="object")toolArgs.customer={};
    if(state.customerName&&!toolArgs.customer.name)toolArgs.customer.name=state.customerName;
    if(state.confirmedPhone)toolArgs.customer.phone=state.confirmedPhone;
    if(state.confirmedEmail)toolArgs.customer.email=state.confirmedEmail;
    if(state.customerAddress&&!toolArgs.customer.address)toolArgs.customer.address=state.customerAddress;
    return toolArgs;
  }

  async function executeTool(name,args){
    console.log("tool",name,JSON.stringify(args));
    let toolArgs=cloneObject(args);

    if(name==="voice_set_booking_phone"){
      const mode=String(toolArgs.mode||"");
      if(mode==="caller"){
        if(!state.callerPhone)return {success:false,code:"caller_phone_missing",message:"The verified caller number is unavailable."};
        state.confirmedPhone=state.callerPhone;state.customerPhone=state.callerPhone;state.bookingPhoneChoiceResolved=true;state.bookingPhoneSource="caller";state.awaitingBookingPhoneChoice=false;state.voiceState.booking_phone=state.callerPhone;state.pendingContactConfirmation=null;
        return {success:true,booking_phone_locked:true,mode:"caller"};
      }
      if(mode==="alternate"){
        const p=normalizePhone(toolArgs.phone||"");
        if(!p)return {success:false,code:"alternate_phone_required",message:"Ask for the different booking phone number as the next single question."};
        if(p===state.confirmedPhone&&state.bookingPhoneChoiceResolved)return {success:true,booking_phone_locked:true,mode:"alternate"};
        if(p===state.callerPhone){state.confirmedPhone=p;state.customerPhone=p;state.bookingPhoneChoiceResolved=true;state.bookingPhoneSource="caller";state.voiceState.booking_phone=p;return {success:true,booking_phone_locked:true,mode:"caller"};}
        state.customerPhone=p;state.bookingPhoneSource="alternate";state.bookingPhoneChoiceResolved=false;state.awaitingBookingPhoneChoice=false;
        return contactGateResult("phone",p,"booking_phone");
      }
      return {success:false,error:"Invalid booking phone mode."};
    }
    if(name==="voice_set_booking_notes"){
      const mode=String(toolArgs.mode||"");
      if(mode==="none")state.voiceState.booking_notes="";
      else if(mode==="set")state.voiceState.booking_notes=String(toolArgs.notes||"").trim().slice(0,2000);
      else return {success:false,error:"Invalid booking notes mode."};
      return {success:true,booking_notes_recorded:true,mode};
    }
    if(name==="request_human_transfer"||name==="report_priority_issue")return {success:false,test_only:true,error:"Transfer/priority execution is intentionally disabled in this isolated proof harness."};

    const progression=["nbb_get_quote","nbb_get_availability","nbb_prepare_booking","nbb_send_estimate"];
    if(progression.includes(name)){
      const sig=serviceRowsSignature(toolArgs);
      if(sig){
        if(state.serviceCollectionClosed)state.serviceCollectionSignature=sig;
        if(!state.serviceCollectionClosed){
          state.serviceCollectionSignature=sig;state.awaitingAdditionalServiceDecision=true;
          return {success:false,code:"voice_additional_service_check_required",message:'Ask exactly one question: "Would you like to add any other services?" Then stop and wait before progressing.'};
        }
      }
    }

    if(state.workflowIntent==="booking"&&["nbb_get_quote","nbb_send_estimate"].includes(name)&&!(state.quoteSideRequestAt>0&&(Date.now()-state.quoteSideRequestAt)<=120000)){
      return {success:false,code:"voice_booking_goal_locked",message:"The caller asked to schedule/book. Continue the booking flow instead of proactively switching to quote/estimate delivery."};
    }

    if(["nbb_prepare_booking","nbb_send_estimate","nbb_request_callback"].includes(name))toolArgs=mergeKnownCustomer(toolArgs);
    if(name==="nbb_get_availability"&&!toolArgs.address&&state.customerAddress)toolArgs.address=state.customerAddress;

    if(name==="nbb_prepare_booking"){
      if(!state.bookingPhoneChoiceResolved||!state.confirmedPhone){
        const candidate=normalizePhone(toolArgs?.customer?.phone||"");
        if(candidate&&candidate!==state.callerPhone){state.customerPhone=candidate;state.bookingPhoneSource="alternate";return contactGateResult("phone",candidate,"booking_phone");}
        state.awaitingBookingPhoneChoice=true;
        return {success:false,code:"booking_phone_choice_required",message:'Ask exactly one question: "Would you like me to use the number you\'re calling from for this appointment, or use a different number?" Then wait.'};
      }
      if(!toolArgs.customer||typeof toolArgs.customer!=="object")toolArgs.customer={};
      toolArgs.customer.phone=state.confirmedPhone;
      state.voiceState.booking_phone=state.confirmedPhone;
    }

    if(["nbb_prepare_booking","nbb_send_estimate","nbb_request_callback"].includes(name)&&toolArgs?.customer&&typeof toolArgs.customer==="object"){
      let candidatePhone=normalizePhone(toolArgs.customer.phone||"");
      let candidateEmail=normalizedEmail(toolArgs.customer.email||"");
      const requestedDelivery=normalizeEstimateDelivery(toolArgs.delivery||"");
      const effectiveDelivery=requestedDelivery||state.estimateDeliveryPreference;
      const usesEmail=name==="nbb_prepare_booking"||(name==="nbb_send_estimate"&&["email","both"].includes(effectiveDelivery));
      if(state.confirmedPhone){candidatePhone=state.confirmedPhone;toolArgs.customer.phone=state.confirmedPhone;}
      else if(candidatePhone&&candidatePhone!==state.callerPhone)return contactGateResult("phone",candidatePhone,name==="nbb_prepare_booking"?"booking_phone":"");
      if(usesEmail&&state.confirmedEmail){candidateEmail=state.confirmedEmail;toolArgs.customer.email=state.confirmedEmail;}
      else if(usesEmail&&candidateEmail)return contactGateResult("email",candidateEmail,"");
    }

    if(name==="nbb_send_estimate"){
      const requested=normalizeEstimateDelivery(toolArgs.delivery||"");
      if(requested)state.estimateDeliveryPreference=requested;
      const delivery=requested||state.estimateDeliveryPreference;
      if(!delivery)return {success:false,code:"estimate_delivery_required",message:"Ask whether the caller wants the estimate by text, email, or both, according to the enabled channels."};
      toolArgs.delivery=delivery;
    }
    if(name==="nbb_send_sms"){
      const fresh=state.smsRequestAt>0&&(Date.now()-state.smsRequestAt)<=120000;
      if(!fresh)return {success:false,code:"explicit_sms_request_required",message:"The caller has not recently and explicitly asked to receive a text message. Ask first."};
    }
    if(name==="nbb_send_email"){
      const fresh=state.emailRequestAt>0&&(Date.now()-state.emailRequestAt)<=120000;
      if(!fresh)return {success:false,code:"explicit_email_request_required",message:"The caller has not recently and explicitly asked to receive an email. Ask first."};
      const candidate=normalizedEmail(toolArgs.to||"");
      if(state.confirmedEmail)toolArgs.to=state.confirmedEmail;
      else if(candidate)return contactGateResult("email",candidate,"");
      else return {success:false,code:"email_required",message:"Ask for the email address as the next single question."};
    }
    if(name==="nbb_request_callback"){
      toolArgs=mergeKnownCustomer(toolArgs);
      if(!toolArgs.customer.phone&&state.callerPhone)toolArgs.customer.phone=state.callerPhone;
    }
    if(name==="nbb_commit_booking"){
      if(!state.lastReviewToken)return {success:false,code:"booking_not_prepared",message:"No validated Nearby Booker booking review is ready to submit."};
      const fresh=state.bookingConfirmationAt>0&&state.bookingConfirmationAt>=state.preparedAt&&(Date.now()-state.bookingConfirmationAt)<=120000;
      if(!fresh)return {success:false,code:"explicit_confirmation_required",message:"Read back the validated booking review and ask the caller for a clear yes before submitting."};
      toolArgs={review_token:state.lastReviewToken};
    }

    // NBB .63 uses recent caller-visible Voice conversation as a defense-in-depth
    // grounding check for configured sibling variants/secondary service choices.
    // Preserve the exact production contract rather than bypassing it.
    if(progression.includes(name)){
      flushAssistantBuffer();
      toolArgs.voice_conversation=state.conversationMessages.slice(-40).map(row=>({role:String(row.role||""),content:String(row.content||"").slice(0,2000)}));
    }

    try{
      const base=state.siteUrl.replace(/\/+$/,"");
      const response=await postJson(base+"/wp-json/nbb-gpt-live-test/v1/tool",{session_token:state.sessionToken,tool_name:name,arguments:toolArgs,voice_state:state.voiceState});
      const result=response?.result??response;
      if(name==="nbb_validate_address"&&result&&typeof result==="object"&&result.eligible_for_search){
        const addr=String(result.formatted_address||result.address||toolArgs.address||"").trim();if(addr)state.customerAddress=addr;
      }
      if(["nbb_prepare_booking","nbb_send_estimate","nbb_request_callback"].includes(name)&&toolArgs?.customer&&typeof toolArgs.customer==="object"){
        state.customerName=String(toolArgs.customer.name||state.customerName||"");
        state.customerPhone=normalizePhone(toolArgs.customer.phone||state.customerPhone||"");
        state.customerEmail=normalizedEmail(toolArgs.customer.email||state.customerEmail||"");
        if(toolArgs.customer.address)state.customerAddress=String(toolArgs.customer.address);
      }
      if(name==="nbb_prepare_booking"&&result?.review_token){
        state.lastReviewToken=String(result.review_token);state.preparedAt=Date.now();state.bookingConfirmationAt=0;state.awaitingBookingConfirmation=true;
      }
      if(name==="nbb_commit_booking"&&(result?.booking_id||result?.success===true)){
        state.lastReviewToken="";state.preparedAt=0;state.bookingConfirmationAt=0;state.awaitingBookingConfirmation=false;
      }
      if(state.workflowIntent==="booking"&&["nbb_get_quote","nbb_send_estimate"].includes(name))state.quoteSideRequestAt=0;
      return response;
    }catch(e){
      console.error("tool failed",name,e?.status,e?.data||e?.message);
      return {success:false,error:e?.message||"Tool request failed",status:e?.status||500};
    }
  }

  twilio.on("message",async raw=>{
    const msg=safeJson(raw.toString());if(!msg)return;
    try{
      if(msg.event==="start"){
        state.streamSid=msg.start?.streamSid||msg.streamSid||"";
        const cp=msg.start?.customParameters||{};
        state.siteUrl=String(cp.site_url||"").trim();state.sessionToken=String(cp.session_token||"").trim();
        if(!state.siteUrl.startsWith("https://")||!state.sessionToken)throw new Error("Missing test adapter parameters.");
        await startLive();return;
      }
      if(msg.event==="media"&&msg.media?.payload){if(state.liveStarted)sendLive({type:"session.input_audio.append",audio:msg.media.payload});return;}
      if(msg.event==="stop"){
        state.closing=true;flushCallerBuffer();
        if(state.openai?.readyState===WebSocket.OPEN){sendLive({type:"session.close",event_id:"twilio_stop"});setTimeout(()=>{try{state.openai.close();}catch{}},1500);}return;
      }
    }catch(e){console.error("Twilio handler failed",e?.stack||e);try{twilio.close();}catch{}}
  });
  twilio.on("close",()=>{
    state.closing=true;if(state.callerFlushTimer)clearTimeout(state.callerFlushTimer);
    if(state.openai?.readyState===WebSocket.OPEN){try{sendLive({type:"session.close",event_id:"twilio_closed"});}catch{}setTimeout(()=>{try{state.openai.close();}catch{}},750);}
  });
  twilio.on("error",e=>console.error("Twilio socket error",e?.message||e));
});

server.listen(PORT,()=>console.log(`NBB GPT-Live Ripple test relay v${VERSION} listening on ${PORT}`));
