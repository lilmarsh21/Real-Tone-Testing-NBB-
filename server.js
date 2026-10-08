import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { ALL_TOOLS } from "./tools.js";

const VERSION = "0.2.1";
const PORT = Number(process.env.PORT || 10000);
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const ADAPTER_SECRET = (process.env.NBB_ADAPTER_SECRET || "").trim();
const LIVE_VOICE = (process.env.LIVE_VOICE || "ripple").trim();
const LEGACY_BRAIN_MODEL = (process.env.LEGACY_BRAIN_MODEL || "gpt-realtime-2.1").trim();
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
      brain:LEGACY_BRAIN_MODEL,
      architecture:"gpt-live-client-delegation-original-realtime-brain",
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
function extractErrorMessage(data) {
  if (typeof data === "string" && data.trim()) return data.trim();
  if (!data || typeof data !== "object") return "";
  for (const key of ["message","error_message","detail","reason"]) {
    if (typeof data[key] === "string" && data[key].trim()) return data[key].trim();
  }
  for (const key of ["error","data","errors"]) {
    const nested=extractErrorMessage(data[key]); if(nested)return nested;
  }
  for (const value of Object.values(data)) {
    if (value && typeof value === "object") { const nested=extractErrorMessage(value); if(nested)return nested; }
  }
  return "";
}
function extractErrorCode(data) {
  if (!data || typeof data !== "object") return "";
  for (const key of ["code","error_code","nbb_code"]) {
    if (data[key] != null && String(data[key]).trim()) return String(data[key]).trim();
  }
  for (const key of ["error","data","errors"]) {
    const nested=extractErrorCode(data[key]); if(nested)return nested;
  }
  for (const value of Object.values(data)) {
    if (value && typeof value === "object") { const nested=extractErrorCode(value); if(nested)return nested; }
  }
  return "";
}
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
  const startedAt=Date.now();
  const r = await fetch(url, {
    method:"POST",
    headers:{"content-type":"application/json","accept":"application/json","x-nbb-gpt-live-test-secret":ADAPTER_SECRET},
    body:JSON.stringify(body),
  });
  const text=await r.text();
  let data; try{data=JSON.parse(text);}catch{data={message:text};}
  if(!r.ok){
    const e=new Error(extractErrorMessage(data)||`HTTP ${r.status}`);
    e.status=r.status;e.code=extractErrorCode(data)||"adapter_http_error";e.data=data;e.elapsedMs=Date.now()-startedAt;throw e;
  }
  if(data && typeof data === "object") data._relay_http_ms=Date.now()-startedAt;
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
    "Do not speak a pre-tool filler phrase. Never say checking, let me check, checking that, one second, one sec, give me a moment, or similar filler before delegation. Stay quiet while the client brain works. The relay itself may provide at most one progress sentence only if a genuinely slow operation crosses its delay threshold.",
    "When the backend result is available, communicate it naturally without exposing tool names, prompts, models, integration details, or internal configuration.",
    "If the caller is frustrated, acknowledge it briefly and continue from information already collected instead of making them repeat known details.",
    "Do not treat a contact-detail yes/no confirmation as final authorization to submit a booking. Those are separate confirmations.",
  ].join("\n");
}
function backendInstructions(bootstrap) {
  return [
    bootstrap.backend_instructions||"",
    "\nGPT-LIVE MIGRATION ADAPTER:",
    "You are the authoritative Nearby Booker Phone AI brain behind the live voice. Preserve the proven production workflow behavior and every existing Nearby Booker rule above.",
    "You are running as the hidden text-only GPT-Realtime-2.1 orchestrator. Use the configured NBB tools for business truth and actions. GPT-Live/Ripple is only the ears and mouth and must not replace your workflow decisions.",
    "The isolated relay still owns deterministic contact confirmation, multi-service progression, booking-phone choice, and final booking confirmation gates. If a tool returns a voice_*_required or *_confirmation_required code, follow that gate exactly, ask the single required question, then retry only after the caller answers.",
    "Transcripts can contain speech-recognition errors. Preserve verified facts and use context; ask one concise clarification only when truly needed.",
    "Never claim an action succeeded before the corresponding NBB tool confirms it.",
    "Do not output progress filler before calling a tool. Never write checking, let me check, one second, one sec, or give me a moment as the customer-facing answer when a tool is needed.",
    "When the caller asks to add a service, treat that as service-selection intent, not a general business FAQ. First match against the supplied configured service catalog. If a configured service matches, add that service to the active service set and collect its configured quantity/selection details; do not call the business-question tool merely to ask whether the business offers it.",
    "Before closing service collection or asking whether they want anything else, inspect the selected services' configured AI context/private selection rules, sibling variants, clarification questions, and required questions. If the caller's description triggers a configured secondary choice or required clarification, resolve that first. This rule is generic and comes only from tenant configuration; never hard-code a service scenario.",
    "Return concise customer-facing text suitable for the voice layer. Never mention internal tools or configuration.",
  ].join("\n");
}

wss.on("connection", twilio=>{
  const state={
    streamSid:"",sessionToken:"",siteUrl:"",bootstrap:null,
    openai:null,brain:null,liveStarted:false,brainReady:false,closing:false,
    callerPhone:"",customerName:"",customerPhone:"",customerEmail:"",customerAddress:"",
    confirmedPhone:"",confirmedEmail:"",bookingPhoneChoiceResolved:false,bookingPhoneSource:"",awaitingBookingPhoneChoice:false,
    pendingContactConfirmation:null,
    voiceState:{booking_phone:"",booking_notes:""},
    serviceCollectionClosed:false,awaitingAdditionalServiceDecision:false,serviceCollectionSignature:"",
    workflowIntent:"",quoteSideRequestAt:0,
    estimateDeliveryPreference:"",smsRequestAt:0,emailRequestAt:0,
    lastReviewToken:"",preparedAt:0,bookingConfirmationAt:0,awaitingBookingConfirmation:false,
    outputSinceInput:false,callerBuffer:"",callerFlushTimer:null,assistantRecent:"",assistantBuffer:"",
    conversationMessages:[],callerTurnSeq:0,lastDelegatedCallerTurnSeq:0,lastCallerText:"",
    brainActive:null,brainChain:Promise.resolve(),brainTools:[],
    runtime:{dead_air_seconds:7,silence_hangup_seconds:10,interruption_mode:"auto",barge_in_enabled:true,booking_notes:false},
    bookingNotesChoiceResolved:false,awaitingBookingNotesChoice:false,bookingNotes:"",
    backendBusyDepth:0,slowProgressTurnSeq:0,slowProgressTimer:null,activeDelegationId:"",currentToolName:"",
    callerSpeechActive:false,aiAudioActive:false,aiPlaybackPending:false,aiAudioIdleTimer:null,lastSpokenActivityAt:0,silenceTimer:null,silenceHangupInProgress:false,
    playbackMarkSeq:0,pendingPlaybackMarks:new Set(),deadAirTimer:null,deadAirRetryTurnSeq:0,lastOutputAudioAt:0,awaitingCommentaryAudio:false,commentaryStartedAt:0,
  };

  const sendTwilio=obj=>{if(twilio.readyState===WebSocket.OPEN)twilio.send(JSON.stringify(obj));};
  const sendLive=obj=>{if(state.openai?.readyState===WebSocket.OPEN)state.openai.send(JSON.stringify(obj));};
  const sendBrain=obj=>{if(state.brain?.readyState===WebSocket.OPEN)state.brain.send(JSON.stringify(obj));};
  const appendLiveInstruction=content=>{
    const text=String(content||"").trim(); if(!text)return;
    sendLive({type:"session.instructions.append",event_id:`state_${Date.now()}_${Math.random().toString(16).slice(2,8)}`,delegation_id:null,content:text.slice(0,1800)});
  };
  const boundedInt=(value,fallback,min,max)=>{
    const n=Number(value); return Math.max(min,Math.min(max,Number.isFinite(n)?n:fallback));
  };
  const silenceHangupSeconds=()=>boundedInt(state.runtime?.silence_hangup_seconds,10,5,60);
  const deadAirSeconds=()=>boundedInt(state.runtime?.dead_air_seconds,7,4,20);
  function clearSilenceTimer(){if(state.silenceTimer)clearTimeout(state.silenceTimer);state.silenceTimer=null;}
  function clearDeadAirTimer(){if(state.deadAirTimer)clearTimeout(state.deadAirTimer);state.deadAirTimer=null;}
  function clearSlowProgressTimer(){if(state.slowProgressTimer)clearTimeout(state.slowProgressTimer);state.slowProgressTimer=null;}
  function markSpokenActivity(keepPaused=false){state.lastSpokenActivityAt=Date.now();clearSilenceTimer();if(!keepPaused)armSilenceTimer();}
  function armSilenceTimer(){
    clearSilenceTimer();
    if(state.closing||state.silenceHangupInProgress||!state.lastSpokenActivityAt)return;
    if(state.backendBusyDepth>0||state.awaitingCommentaryAudio||state.callerSpeechActive||state.aiAudioActive||state.aiPlaybackPending)return;
    const ms=silenceHangupSeconds()*1000;
    const remaining=Math.max(50,ms-(Date.now()-state.lastSpokenActivityAt));
    state.silenceTimer=setTimeout(executeSilenceHangup,remaining);
  }
  function executeSilenceHangup(){
    if(state.closing||state.silenceHangupInProgress)return;
    if(state.backendBusyDepth>0||state.awaitingCommentaryAudio||state.callerSpeechActive||state.aiAudioActive||state.aiPlaybackPending){armSilenceTimer();return;}
    const seconds=silenceHangupSeconds();
    if(!state.lastSpokenActivityAt||Date.now()-state.lastSpokenActivityAt<(seconds*1000)-50){armSilenceTimer();return;}
    state.silenceHangupInProgress=true;clearSilenceTimer();clearDeadAirTimer();clearSlowProgressTimer();
    console.log("silence timeout",seconds,"seconds - closing isolated test call");
    state.closing=true;
    try{sendLive({type:"session.close",event_id:`silence_${Date.now()}`});}catch{}
    try{if(state.openai?.readyState===WebSocket.OPEN)state.openai.close(1000,"silence_timeout");}catch{}
    try{if(state.brain?.readyState===WebSocket.OPEN)state.brain.close(1000,"silence_timeout");}catch{}
    try{if(twilio.readyState===WebSocket.OPEN)twilio.close(1000,"silence_timeout");}catch{}
  }
  function sendPlaybackMark(){
    if(twilio.readyState!==WebSocket.OPEN||!state.streamSid)return false;
    state.playbackMarkSeq+=1;const name=`ripple_playback_${state.playbackMarkSeq}`;
    state.pendingPlaybackMarks.add(name);state.aiPlaybackPending=true;
    sendTwilio({event:"mark",streamSid:state.streamSid,mark:{name}});return true;
  }
  function handlePlaybackMark(name){
    const n=String(name||"");if(!state.pendingPlaybackMarks.has(n))return;
    state.pendingPlaybackMarks.delete(n);if(state.pendingPlaybackMarks.size>0)return;
    state.aiPlaybackPending=false;state.aiAudioActive=false;state.lastSpokenActivityAt=Date.now();armSilenceTimer();
  }
  function noteAiAudio(){
    state.lastOutputAudioAt=Date.now();state.awaitingCommentaryAudio=false;state.aiAudioActive=true;clearSilenceTimer();clearDeadAirTimer();
    if(state.aiAudioIdleTimer)clearTimeout(state.aiAudioIdleTimer);
    state.aiAudioIdleTimer=setTimeout(()=>{
      state.aiAudioIdleTimer=null;state.aiAudioActive=false;
      if(!sendPlaybackMark()){state.aiPlaybackPending=false;markSpokenActivity();}
    },500);
  }
  function beginBackendWork(){state.backendBusyDepth+=1;clearSilenceTimer();clearDeadAirTimer();}
  function endBackendWork(){state.backendBusyDepth=Math.max(0,state.backendBusyDepth-1);if(state.backendBusyDepth===0)armSilenceTimer();}
  function slowProgressPhrase(toolName){
    const name=String(toolName||"");
    if(name==="nbb_validate_address")return "I'm still checking that address—one moment.";
    if(name==="nbb_get_availability"||name==="nbb_get_reschedule_availability")return "I'm still checking the schedule—one moment.";
    if(name==="nbb_prepare_booking"||name==="nbb_commit_booking")return "I'm still finishing that appointment—one moment.";
    if(name==="nbb_send_estimate")return "I'm still putting that estimate together—one moment.";
    return "I'm still working on that—one moment.";
  }
  function speakSlowProgress(turnSeq){
    if(state.closing||state.backendBusyDepth<=0||state.slowProgressTurnSeq===turnSeq)return;
    if(!state.activeDelegationId||state.callerTurnSeq!==turnSeq)return;
    state.slowProgressTurnSeq=turnSeq;
    const phrase=slowProgressPhrase(state.currentToolName);
    console.log("slow progress",state.currentToolName||"brain","caller_turn",turnSeq,"after_ms",5000);
    state.awaitingCommentaryAudio=true;
    sendLive({
      type:"session.commentary.append",
      event_id:`progress_${Date.now()}`,
      delegation_id:state.activeDelegationId,
      content:phrase
    });
  }
  function scheduleSlowProgress(){
    clearSlowProgressTimer();
    const turnSeq=state.callerTurnSeq;
    state.slowProgressTimer=setTimeout(()=>speakSlowProgress(turnSeq),5000);
  }
  function armDeadAirRecovery(delegationId,resultText,turnSeq){
    clearDeadAirTimer();
    const baseline=state.lastOutputAudioAt;
    state.deadAirTimer=setTimeout(()=>{
      if(state.closing||state.callerTurnSeq!==turnSeq||state.lastOutputAudioAt>baseline)return;
      if(state.deadAirRetryTurnSeq===turnSeq)return;
      state.deadAirRetryTurnSeq=turnSeq;
      console.warn("dead-air recovery",delegationId,"caller_turn",turnSeq);
      sendLive({type:"session.commentary.append",event_id:`brain_retry_${Date.now()}`,delegation_id:delegationId,content:String(resultText||"").trim()});
      state.deadAirTimer=setTimeout(()=>{
        if(state.closing||state.lastOutputAudioAt>baseline)return;
        state.awaitingCommentaryAudio=false;
        console.warn("dead-air recovery exhausted",delegationId,"caller_turn",turnSeq);
        markSpokenActivity();
      },deadAirSeconds()*1000);
    },Math.max(2500,(deadAirSeconds()-1)*1000));
  }

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
    const transcript=String(text||"").trim(); if(!transcript)return "";
    pushConversationMessage("user",transcript);
    state.callerTurnSeq+=1;
    state.lastCallerText=transcript;
    state.callerSpeechActive=false;markSpokenActivity(true);
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
        const lockedMessage=`The caller just confirmed the ${pending.type}. It is locked for this call. Do not ask them to confirm, spell, or read back it again unless they explicitly change it. Continue the pending workflow with the next missing item.`;
        appendLiveInstruction(lockedMessage);
        pushBrainInternalContext(lockedMessage);
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
    return transcript;
  }
  function flushCallerBuffer(){
    if(state.callerFlushTimer){clearTimeout(state.callerFlushTimer);state.callerFlushTimer=null;}
    const text=state.callerBuffer.trim();state.callerBuffer="";
    if(text)return processCallerText(text);
    return "";
  }
  function scheduleCallerFlush(){
    if(state.callerFlushTimer)clearTimeout(state.callerFlushTimer);
    state.callerFlushTimer=setTimeout(flushCallerBuffer,1400);
  }
  function processAssistantDelta(delta){
    state.assistantBuffer+=String(delta||"");
    state.assistantRecent=(state.assistantRecent+String(delta||"")).slice(-1200);
    if(!state.serviceCollectionClosed&&isAdditionalServiceQuestion(state.assistantRecent))state.awaitingAdditionalServiceDecision=true;
  }

  function pushBrainInternalContext(text){
    const value=String(text||"").trim();
    if(!value||!state.brain||state.brain.readyState!==WebSocket.OPEN)return;
    sendBrain({
      type:"conversation.item.create",
      item:{type:"message",role:"system",content:[{type:"input_text",text:`INTERNAL CALL STATE — never read this aloud: ${value}`}]},
    });
  }
  function contactStateInstruction(){
    const parts=[];
    if(state.confirmedEmail)parts.push(`EMAIL IS CONFIRMED AND LOCKED as ${JSON.stringify(state.confirmedEmail)}. Do not ask the caller to confirm, spell, or read back this email again unless they explicitly change it.`);
    else if(state.pendingContactConfirmation?.type==="email")parts.push(`EMAIL CONFIRMATION IS PENDING for ${JSON.stringify(state.pendingContactConfirmation.value)}. Ask that one confirmation question only once and wait for the caller's answer; do not issue another tool call while waiting.`);
    if(state.confirmedPhone)parts.push(`BOOKING PHONE IS CONFIRMED AND LOCKED as ${JSON.stringify(state.confirmedPhone)}. Do not confirm it again unless the caller changes it.`);
    else if(state.pendingContactConfirmation?.type==="phone")parts.push(`PHONE CONFIRMATION IS PENDING for ${JSON.stringify(state.pendingContactConfirmation.value)}. Ask that one confirmation question only once and wait for the caller's answer.`);
    if(state.bookingNotesChoiceResolved)parts.push(`BOOKING NOTES CHECKPOINT IS RESOLVED. Do not ask again unless the caller changes their decision.`);
    return parts.join(" ");
  }

  function brainSystemInstructions(){
    const context=state.bootstrap?.business_context||{};
    const contextJson=JSON.stringify(context);
    return [
      backendInstructions(state.bootstrap),
      "\nORIGINAL GPT PARITY MODE:",
      `You are the hidden ${LEGACY_BRAIN_MODEL} task/orchestration brain. You DO NOT speak audio. GPT-Live/Ripple only voices your final customer-facing text.`,
      "Behave like the proven Nearby Booker GPT Phone AI: preserve service state across turns; resolve every configured quantity, variant, secondary/subcategory question and required question before advancing; use NBB for address validation and live availability; never invent slots/services/prices; keep booking/estimate/contact confirmation gates separate. Contact confirmation is relay-owned: once the relay marks an email or phone confirmed, never ask for another confirmation unless the caller explicitly changes that value.",
      "The complete current Nearby Booker business context is supplied below at session start. Treat it as authoritative silent working data. Do not wait to rediscover it unless a fresh context lookup is genuinely needed.",
      `NBB BUSINESS CONTEXT JSON:\n${contextJson}`,
      "Before any progression tool, re-check the selected configured services against their service AI context, private selection notes, clarification question, required questions, and same-category sibling variants. Resolve any caller-triggered secondary choice before moving on.",
      "If the caller says they want to add a service, add the matching configured service; do not answer with a business-FAQ statement that the service exists but cannot be added.",
      "For each caller turn, do the business reasoning and tool work first. Return only the concise customer-facing sentence(s) that Ripple should say next. If one detail is missing, ask exactly one question and stop. Never return a progress-only phrase such as checking or one sec."
    ].join("\n");
  }

  function waitForBrainReady(timeoutMs=12000){
    if(state.brainReady&&state.brain?.readyState===WebSocket.OPEN)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const started=Date.now();
      const tick=()=>{
        if(state.brainReady&&state.brain?.readyState===WebSocket.OPEN)return resolve();
        if(Date.now()-started>timeoutMs)return reject(new Error("Legacy GPT brain did not become ready."));
        setTimeout(tick,50);
      };
      tick();
    });
  }

  function startBrain(tools){
    return new Promise((resolve,reject)=>{
      const url=new URL("wss://api.openai.com/v1/realtime");
      url.searchParams.set("model",LEGACY_BRAIN_MODEL);
      const ws=new WebSocket(url.toString(),{headers:{Authorization:`Bearer ${OPENAI_API_KEY}`}});
      state.brain=ws;
      let settled=false;
      const fail=e=>{if(!settled){settled=true;reject(e instanceof Error?e:new Error(String(e||"Brain startup failed")));}};
      ws.on("open",()=>{
        sendBrain({
          type:"session.update",
          session:{
            type:"realtime",
            model:LEGACY_BRAIN_MODEL,
            output_modalities:["text"],
            instructions:brainSystemInstructions(),
            tools,
            tool_choice:"auto",
            parallel_tool_calls:false
          }
        });
      });
      ws.on("message",raw=>handleBrainEvent(raw));
      ws.on("error",e=>{console.error("Legacy GPT brain socket error",e?.message||e);fail(e);});
      ws.on("close",(code,reason)=>{
        console.log("Legacy GPT brain socket closed",code,String(reason||""));
        state.brainReady=false;
        if(!state.closing&&state.brainActive){
          const active=state.brainActive;state.brainActive=null;
          clearTimeout(active.timer);active.reject(new Error("Legacy GPT brain disconnected."));
        }
      });
      const startupTimer=setTimeout(()=>fail(new Error("Legacy GPT brain startup timed out.")),12000);
      state._brainStartupResolve=()=>{
        if(settled)return;
        settled=true;clearTimeout(startupTimer);resolve();
      };
    });
  }

  function handleBrainEvent(raw){
    const evt=safeJson(raw.toString()); if(!evt)return;
    if(evt.type==="session.created"){
      return;
    }
    if(evt.type==="session.updated"){
      if(!state.brainReady){
        state.brainReady=true;
        console.log("Legacy GPT brain ready",LEGACY_BRAIN_MODEL,"tools",state.brainTools.length);
        state._brainStartupResolve?.();state._brainStartupResolve=null;
      }
      return;
    }
    if(evt.type==="error"){
      console.error("Legacy GPT brain error",JSON.stringify(evt));
      if(state.brainActive){const a=state.brainActive;state.brainActive=null;clearTimeout(a.timer);a.reject(new Error(evt?.error?.message||"Legacy GPT brain error"));}
      return;
    }
    const active=state.brainActive;
    if(!active)return;
    if(evt.type==="response.output_text.delta"&&evt.delta){active.text+=String(evt.delta);return;}
    if(evt.type==="response.output_text.done"&&evt.text&&!active.text){active.text=String(evt.text);return;}
    if(evt.type==="response.output_item.done"&&evt.item?.type==="function_call"){
      const item=evt.item;
      if(!item.call_id||!item.name||active.handledCalls.has(item.call_id))return;
      active.handledCalls.add(item.call_id);active.hadTool=true;active.pendingTools+=1;
      const args=safeJson(item.arguments||"{}")||{};
      const toolStartedAt=Date.now();
      Promise.resolve(executeTool(item.name,args)).then(result=>{
        active.toolMs+=Date.now()-toolStartedAt;
        if(state.brainActive!==active)return;
        if(result&&typeof result==="object"&&result.relay_terminal_prompt&&!active.relayStopText){
          active.relayStopText=String(result.relay_terminal_prompt).trim();
        }
        sendBrain({type:"conversation.item.create",item:{type:"function_call_output",call_id:item.call_id,output:JSON.stringify(result)}});
      }).catch(e=>{
        if(state.brainActive!==active)return;
        sendBrain({type:"conversation.item.create",item:{type:"function_call_output",call_id:item.call_id,output:JSON.stringify({success:false,error:e?.message||"Tool failed"})}});
      }).finally(()=>{
        if(state.brainActive!==active)return;
        active.pendingTools=Math.max(0,active.pendingTools-1);
        if(active.responseDone&&active.pendingTools===0)continueBrainAfterTools(active);
      });
      return;
    }
    if(evt.type==="response.done"){
      if(evt.response?.status&&evt.response.status!=="completed"){
        const err=evt.response?.status_details?.error?.message||`Brain response ${evt.response.status}`;
        state.brainActive=null;clearTimeout(active.timer);active.reject(new Error(err));return;
      }
      active.responseDone=true;
      if(active.hadTool){
        if(active.pendingTools===0)continueBrainAfterTools(active);
        return;
      }
      const text=String(active.text||"").trim();
      state.brainActive=null;clearTimeout(active.timer);
      console.log("brain complete","total_ms",Date.now()-active.startedAt,"tool_ms",active.toolMs,"steps",active.steps,"chars",text.length);
      if(text)active.resolve(text);
      else active.reject(new Error("Legacy GPT brain returned no customer-facing text."));
    }
  }

  function continueBrainAfterTools(active){
    if(state.brainActive!==active)return;
    if(active.relayStopText){
      const text=String(active.relayStopText).trim();
      state.brainActive=null;clearTimeout(active.timer);
      console.log("brain relay gate","chars",text.length,"total_ms",Date.now()-active.startedAt,"tool_ms",active.toolMs);
      active.resolve(text);
      return;
    }
    active.steps+=1;
    if(active.steps>12){
      state.brainActive=null;clearTimeout(active.timer);active.reject(new Error("Legacy GPT brain exceeded tool-loop safety limit."));return;
    }
    active.text="";active.hadTool=false;active.responseDone=false;active.pendingTools=0;
    sendBrain({type:"response.create",response:{output_modalities:["text"]}});
  }

  async function runBrainTurn(transcript){
    await waitForBrainReady();
    if(state.brainActive)throw new Error("Legacy GPT brain is already processing another caller turn.");
    return new Promise((resolve,reject)=>{
      const active={resolve,reject,text:"",hadTool:false,responseDone:false,pendingTools:0,steps:0,handledCalls:new Set(),timer:null,startedAt:Date.now(),toolMs:0,relayStopText:""};
      active.timer=setTimeout(()=>{
        if(state.brainActive===active)state.brainActive=null;
        reject(new Error("Legacy GPT brain turn timed out."));
      },90000);
      state.brainActive=active;
      const contactState=contactStateInstruction();
      if(contactState)pushBrainInternalContext(contactState);
      sendBrain({type:"conversation.item.create",item:{type:"message",role:"user",content:[{type:"input_text",text:transcript}]}});
      sendBrain({type:"response.create",response:{output_modalities:["text"]}});
    });
  }

  function commentaryChunks(text){
    const src=String(text||"").trim();if(!src)return [];
    const chunks=[];let rest=src;
    while(rest.length>1400){
      let cut=Math.max(rest.lastIndexOf(". ",1400),rest.lastIndexOf("? ",1400),rest.lastIndexOf("! ",1400),rest.lastIndexOf("; ",1400));
      if(cut<700)cut=1400;else cut+=1;
      chunks.push(rest.slice(0,cut).trim());rest=rest.slice(cut).trim();
    }
    if(rest)chunks.push(rest);return chunks;
  }

  async function handleClientDelegation(evt){
    const delegationId=String(evt?.delegation?.id||evt?.delegation_id||"").trim();
    if(!delegationId)return;
    flushCallerBuffer();
    // Delegation can arrive milliseconds before the final transcript delta has been
    // observed by our socket. Give it a tiny bounded window rather than guessing.
    const waitForTurn=async()=>{
      for(let i=0;i<8;i+=1){
        if(state.callerTurnSeq>state.lastDelegatedCallerTurnSeq&&state.lastCallerText)return state.lastCallerText;
        await new Promise(r=>setTimeout(r,50));flushCallerBuffer();
      }
      return state.lastCallerText||"";
    };
    const transcript=await waitForTurn();
    if(!transcript){
      console.warn("Client delegation arrived without caller transcript",delegationId);
      sendLive({type:"session.commentary.append",event_id:`brain_missing_${Date.now()}`,delegation_id:delegationId,content:"I didn't catch that clearly. Could you say that again?"});
      return;
    }
    state.lastDelegatedCallerTurnSeq=state.callerTurnSeq;
    const delegationStartedAt=Date.now();
    const turnSeq=state.callerTurnSeq;
    state.activeDelegationId=delegationId;
    state.currentToolName="";
    console.log("client delegation",delegationId,"caller_turn",turnSeq);
    beginBackendWork();
    scheduleSlowProgress();
    state.brainChain=state.brainChain.then(async()=>{
      const result=await runBrainTurn(transcript);
      console.log("legacy brain result",delegationId,"chars",result.length,"delegation_ms",Date.now()-delegationStartedAt);
      state.awaitingCommentaryAudio=true;state.commentaryStartedAt=Date.now();
      for(const [i,chunk] of commentaryChunks(result).entries()){
        sendLive({type:"session.commentary.append",event_id:`brain_result_${Date.now()}_${i}`,delegation_id:delegationId,content:chunk});
      }
      armDeadAirRecovery(delegationId,result,turnSeq);
    }).catch(e=>{
      console.error("Client delegation failed",delegationId,e?.stack||e);
      sendLive({type:"session.commentary.append",event_id:`brain_error_${Date.now()}`,delegation_id:delegationId,content:"I'm sorry, I couldn't complete that request. Could you give me that last detail one more time?"});
    }).finally(()=>{
      clearSlowProgressTimer();
      if(state.activeDelegationId===delegationId)state.activeDelegationId="";
      state.currentToolName="";
      endBackendWork();
      console.log("client delegation complete",delegationId,"total_ms",Date.now()-delegationStartedAt);
    });
    await state.brainChain;
  }

  async function startLive(){
    const u=new URL(state.siteUrl);
    if(u.protocol!=="https:"||u.hostname.toLowerCase()!==TEST_SITE_HOST)throw new Error(`Test adapter host must be ${TEST_SITE_HOST}.`);
    const base=state.siteUrl.replace(/\/+$/,"");
    const bootstrapStartedAt=Date.now();
    state.bootstrap=await postJson(base+"/wp-json/nbb-gpt-live-test/v1/bootstrap",{session_token:state.sessionToken});
    state.runtime={...state.runtime,...(state.bootstrap?.runtime_settings||{})};
    state.callerPhone=normalizePhone(state.bootstrap?.session?.caller_phone);
    console.log("bootstrap complete","relay_ms",Date.now()-bootstrapStartedAt,"adapter_http_ms",state.bootstrap?._relay_http_ms||0,"context_ms",state.bootstrap?.test_diagnostics?.bootstrap_context_ms??"n/a","runtime",JSON.stringify(state.runtime));
    const tools=filterTools(state.bootstrap.capabilities||{});
    state.brainTools=tools;
    await startBrain(tools);

    const ws=new WebSocket("wss://api.openai.com/v1/live/sessions",{headers:{Authorization:`Bearer ${OPENAI_API_KEY}`}});
    state.openai=ws;
    ws.on("open",()=>{
      ws.send(JSON.stringify({
        type:"session.start",event_id:"nbb_live_start",
        session:{
          model:"gpt-live-1",
          instructions:livePrompt(state.bootstrap)+"\nCLIENT DELEGATION PARITY MODE: After the opening greeting, delegate EVERY substantive caller turn to the client before speaking a business reply. DO NOT speak a filler acknowledgement before delegation. Never say checking, let me check, checking that, one second, one sec, or give me a moment. Stay silent until the client result is ready unless the relay explicitly instructs one single long-operation progress sentence. This includes service descriptions, quantities, secondary/variant details, yes/no answers to workflow questions, address information, date/time preferences, contact details, availability, pricing, booking, estimates, reschedule, cancellation, and business questions. Do not independently decide or advance any Nearby Booker workflow. The client is the proven GPT-Realtime/NBB brain. Speak the client result naturally and concisely. Only trivial social acknowledgements that contain no business/workflow information may be handled without delegation.",
          audio:{format:{type:"audio/pcmu",rate:8000},output:{voice:LIVE_VOICE}},
          delegation:{type:"client"}
        }
      }));
    });

    ws.on("message",async raw=>{
      const evt=safeJson(raw.toString()); if(!evt)return;
      try{
        if(evt.type==="session.started"){
          state.liveStarted=true;
          console.log("GPT-Live started",evt.session?.id||"","voice",LIVE_VOICE,"client_delegation","brain",LEGACY_BRAIN_MODEL,"tools",tools.length);
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
          state.outputSinceInput=true;noteAiAudio();
          sendTwilio({event:"media",streamSid:state.streamSid,media:{payload:evt.delta}});return;
        }
        if(evt.type==="session.output_audio.done"||evt.type==="session.output_audio.completed"){
          if(state.aiAudioIdleTimer){clearTimeout(state.aiAudioIdleTimer);state.aiAudioIdleTimer=null;}
          state.aiAudioActive=false;if(!sendPlaybackMark()){state.aiPlaybackPending=false;markSpokenActivity();}return;
        }
        if(evt.type==="session.input_transcript.delta"&&evt.delta){
          if(state.assistantBuffer)flushAssistantBuffer();
          state.callerSpeechActive=true;markSpokenActivity(true);
          if(state.outputSinceInput&&state.streamSid&&state.runtime?.barge_in_enabled!==false){sendTwilio({event:"clear",streamSid:state.streamSid});state.outputSinceInput=false;state.pendingPlaybackMarks.clear();state.aiPlaybackPending=false;}
          state.callerBuffer+=evt.delta;scheduleCallerFlush();
          if(LOG_TRANSCRIPTS)process.stdout.write(`[caller] ${evt.delta}`);return;
        }
        if(evt.type==="session.output_transcript.delta"&&evt.delta){
          processAssistantDelta(evt.delta);
          if(LOG_TRANSCRIPTS)process.stdout.write(`[agent] ${evt.delta}`);return;
        }
        if(evt.type==="session.delegation.created"){
          await handleClientDelegation(evt);return;
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
    if(type==="email"){
      const prompt=`I have ${spokenEmail(value)}. Is that correct?`;
      pushBrainInternalContext(`EMAIL CONFIRMATION IS NOW PENDING for ${JSON.stringify(value)}. This question is relay-owned. Ask it exactly once, then wait for the caller. Do not call another booking/estimate tool until they answer.`);
      return {success:false,code:"voice_email_confirmation_required",message:`Confirm the email exactly once: ${prompt} Do not retry until the caller answers.`,relay_terminal_prompt:prompt};
    }
    const prompt=`I have ${value}. Is that correct?`;
    pushBrainInternalContext(`PHONE CONFIRMATION IS NOW PENDING for ${JSON.stringify(value)}. This question is relay-owned. Ask it exactly once, then wait for the caller.`);
    return {success:false,code:"voice_phone_confirmation_required",message:`Read back this phone number exactly once: ${prompt} Then wait. Do not retry until the caller answers.`,relay_terminal_prompt:prompt};
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
    const toolStartedAt=Date.now();
    console.log("tool start",name,JSON.stringify(args));
    let toolArgs=cloneObject(args);
    if(name==="nbb_get_business_context"){
      const cached={ok:true,tool_name:name,result:state.bootstrap?.business_context||{},cached:true};
      console.log("tool complete",name,"relay_ms",Date.now()-toolStartedAt,"cached",1);
      return cached;
    }

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
      if(mode==="none"){state.voiceState.booking_notes="";state.bookingNotes="";state.bookingNotesChoiceResolved=true;state.awaitingBookingNotesChoice=false;}
      else if(mode==="set"){
        const notes=String(toolArgs.notes||"").trim().slice(0,2000);
        if(!notes)return {success:false,code:"booking_notes_text_required",message:"Ask for the appointment note as the next single question, then retry with the caller-supplied note."};
        state.voiceState.booking_notes=notes;state.bookingNotes=notes;state.bookingNotesChoiceResolved=true;state.awaitingBookingNotesChoice=false;
      } else return {success:false,error:"Invalid booking notes mode."};
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
      if(state.runtime?.booking_notes&&!state.bookingNotesChoiceResolved){
        state.awaitingBookingNotesChoice=true;
        return {success:false,code:"booking_notes_choice_required",message:'Ask exactly one question: "Would you like to add any notes for the appointment?" Then stop and wait. If no, use voice_set_booking_notes mode none. If yes, collect the note text and use mode set.'};
      }
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
      state.currentToolName=name;
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
      state.currentToolName="";
      console.log("tool complete",name,"relay_ms",Date.now()-toolStartedAt,"adapter_http_ms",response?._relay_http_ms||0,"nbb_ms",response?.test_diagnostics?.nbb_ms??"n/a");
      return response;
    }catch(e){
      state.currentToolName="";
      console.error("tool failed",name,JSON.stringify({status:e?.status||500,code:e?.code||extractErrorCode(e?.data)||"",message:e?.message||"Tool request failed",relay_ms:Date.now()-toolStartedAt,adapter_http_ms:e?.elapsedMs||0,data:e?.data||null}));
      return {success:false,error:e?.message||"Tool request failed",code:e?.code||extractErrorCode(e?.data)||"",status:e?.status||500,details:e?.data||null};
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
      if(msg.event==="mark"){handlePlaybackMark(msg.mark?.name);return;}
      if(msg.event==="stop"){
        state.closing=true;flushCallerBuffer();clearSilenceTimer();clearDeadAirTimer();clearSlowProgressTimer();if(state.aiAudioIdleTimer)clearTimeout(state.aiAudioIdleTimer);
        if(state.openai?.readyState===WebSocket.OPEN){sendLive({type:"session.close",event_id:"twilio_stop"});setTimeout(()=>{try{state.openai.close();}catch{}},1500);} if(state.brain?.readyState===WebSocket.OPEN){setTimeout(()=>{try{state.brain.close();}catch{}},1500);} return;
      }
    }catch(e){console.error("Twilio handler failed",e?.stack||e);try{twilio.close();}catch{}}
  });
  twilio.on("close",()=>{
    state.closing=true;if(state.callerFlushTimer)clearTimeout(state.callerFlushTimer);clearSilenceTimer();clearDeadAirTimer();clearSlowProgressTimer();if(state.aiAudioIdleTimer)clearTimeout(state.aiAudioIdleTimer);
    if(state.openai?.readyState===WebSocket.OPEN){try{sendLive({type:"session.close",event_id:"twilio_closed"});}catch{}setTimeout(()=>{try{state.openai.close();}catch{}},750);} if(state.brain?.readyState===WebSocket.OPEN){setTimeout(()=>{try{state.brain.close();}catch{}},750);}
  });
  twilio.on("error",e=>console.error("Twilio socket error",e?.message||e));
});

server.listen(PORT,()=>console.log(`NBB GPT-Live Ripple client-delegation parity relay v${VERSION} listening on ${PORT}`));
