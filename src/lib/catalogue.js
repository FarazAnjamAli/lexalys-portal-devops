'use strict';
/* Seed data for the services table, taken from docs/03-service-catalogue.md.
   Prices are USD. Loaded once, only into an empty table. */

const SERVICES = [
  ['00', 'workflow-audit', 'Workflow Audit & Costed Roadmap', 'Strategy', 750, null, 5,
    'A document that names every process, the hours and error cost each one carries, what it costs to automate, and the order to do them in so the first fix pays for the second.'],
  ['01', 'ai-receptionist', 'AI Receptionist', 'Voice', 2500, 350, 14,
    'Every call answered on the first ring, 24/7, in your business\'s voice. Routine calls are closed without a human. Anything sensitive is warm-transferred with the context attached.'],
  ['02', 'chatbot-employee', 'Chatbot Employee', 'Chat & Messaging', 1800, 250, 10,
    'The site and WhatsApp answer themselves. Real questions reach a human already summarised, tagged and drafted.'],
  ['03', 'ai-voice-agent', 'AI Voice Agent', 'Voice', 2800, 380, 15,
    'Broader than the receptionist: any inbound or outbound voice workflow that is not front-desk.'],
  ['04', 'cold-calling-agent', 'Cold Calling Agent', 'Voice', 3200, 450, 18,
    'Hundreds of consent-verified dials a day. Your people only ever speak to someone who has already shown interest.'],
  ['05', 'review-generation', 'Review Generation System', 'Growth', 1200, 180, 7,
    'Every finished job triggers a review request at the moment satisfaction peaks. Happy customers post publicly. Unhappy ones reach you privately first.'],
  ['06', 'maps-lead-generator', 'Google Maps Lead Generator', 'Growth', 900, 150, 5,
    'Type a niche and a city. Get a verified, deduplicated, enriched sheet in your CRM before lunch.'],
  ['07', 'outbound-campaign-sender', 'Gmail / Outbound Campaign Sender', 'Growth', 1500, 220, 8,
    'Warmed secondary domains, personalised copy per recipient, automatic throttling, and a reply-classifying agent that only surfaces real interest.'],
  ['08', 'news-digest', 'Company News Scraper & Digest', 'Content & Knowledge', 1100, 160, 6,
    'One digest at 7am. Ranked, deduplicated, summarised, with a "why this matters to you" line written for your business.'],
  ['09', 'video-carousel-generator', 'AI Video & Carousel Generator', 'Content & Knowledge', 2000, 280, 12,
    'A content engine that turns one input into a week of on-brand posts, scheduled, without a designer.'],
  ['10', 'rag-knowledge-system', 'RAG Knowledge System', 'Content & Knowledge', 2800, 320, 15,
    'Ask in plain language, get the answer with the clause, page and document it came from. If the answer is not in the corpus, it says so.'],
  ['11', 'hr-recruiter-agent', 'HR Recruiter Agent', 'Operations', 2600, 300, 15,
    'Four hours from job post to a defensible shortlist of twelve, each with a written reason, and every applicant answered.'],
  ['12', 'quality-inspection-agent', 'Quality Inspection (QI) Agent', 'Operations', 3500, 400, 20,
    'The inspector photographs and speaks. Classification, logging, non-conformance reports and supplier notices happen by themselves.'],
  ['13', 'back-office-overnight-run', 'Back-office Overnight Run', 'Operations', 2200, 290, 12,
    'It is finished before anyone logs in. A single 7am summary says what ran, what needed a human, and what is waiting for approval.'],
  ['14', 'follow-up-agent', 'Follow-up Agent', 'Chat & Messaging', 1600, 230, 9,
    'Every open thread gets chased on a cadence, across email and SMS, written from the actual conversation. A human steps in only when someone replies.'],
  ['15', 'quote-agent', 'Quote Agent', 'Operations', 2400, 310, 13,
    'The quote goes out the same hour, priced off the real rate card, with anything outside the rules stopped for a human.'],
  ['16', 'proposal-agent', 'Proposal Agent', 'Operations', 2700, 340, 15,
    'A tailored proposal draft in under an hour, built from your own past proposals and case studies, with scope and pricing already consistent.'],
  ['17', 'speed-to-lead-agent', 'Speed-to-Lead (S2L) Agent', 'Chat & Messaging', 2100, 270, 11,
    'Every inbound form, missed call and chat gets a real response inside a minute, qualified and booked into the right calendar.'],
  ['18', 'custom-agent', 'Custom Agent / Automation', 'Strategy', 2500, null, null,
    'When it is not on the list. Scoped from the Workflow Audit and priced on the same logic, delivered under the same terms.'],
].map(([code, slug, name, category, setup_price, monthly_price, timeline_days, summary]) => ({
  code, slug, name, category, setup_price, monthly_price, timeline_days, summary,
}));

/* Rush pricing from the catalogue. "faster25" means about 25% faster. */
const RUSH = {
  standard: { label: 'Standard timeline', multiplier: 1.0, speed: 1.0 },
  faster25: { label: 'About 25% faster', multiplier: 1.3, speed: 0.75 },
  faster40: { label: 'About 40% faster', multiplier: 1.6, speed: 0.6 },
  fastest:  { label: 'Fastest possible', multiplier: 1.85, speed: 0.5 },
};

/* One function decides the price, used by both the order form preview and
   the server, so the number a client sees is the number that gets saved. */
function quote(service, rushKey, carePlan) {
  const rush = RUSH[rushKey] || RUSH.standard;
  const setup = Math.round(service.setup_price * rush.multiplier);
  const monthly = carePlan && service.monthly_price ? service.monthly_price : 0;
  const days = service.timeline_days ? Math.max(1, Math.ceil(service.timeline_days * rush.speed)) : null;
  return { setup, monthly, days, rushLabel: rush.label };
}

const CATEGORIES = ['Strategy', 'Voice', 'Chat & Messaging', 'Growth', 'Content & Knowledge', 'Operations'];

module.exports = { SERVICES, RUSH, CATEGORIES, quote };
