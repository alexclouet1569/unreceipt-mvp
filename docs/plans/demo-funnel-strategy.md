# Demo-request funnel: Swedish small businesses with employees (2026-11-17)

How to get more people to unreceipt.com and turn them into demo requests. For the founder. This plan sets the priorities from now on. `seo-and-distribution-plan.md` (2026-11-08) still holds the SEO detail and the backlink list.

## Decisions (founder, 2026-11-17)

| Question | Decision |
|---|---|
| Who should request a demo | Small businesses **with employees** (outlays, approvals). Freelancers stay self-serve. Firms keep their own page. |
| Market | **Sweden only** for now. The EN/FR pages stay but get no new investment. |
| How to request | A short form that qualifies the lead, then the option to book a slot (Cal.com, EU). |
| Analytics | A cookieless, EU-hosted tool is OK (Plausible recommended). |
| Trust | A quote from the pilot accounting firm: yes. The founder's name and photo: not for now. |
| Traffic channels | Founder LinkedIn and outbound, accounting firms as referrers, SEO and content. |
| Working method | This strategy first, then one new conversation per step below. |

## What the audit found (code as of 2026-11-17)

### Why nobody can request a demo
1. **The audience you chose has no page.**
   - No marketing copy mentions employees, utlägg or approvals: `_landing-copy.ts`, `_audience-copy.ts`, `about.ts` and `faq.ts` have zero matches.
   - The team feature has been live since 2026-11-15, but the audience pages are only for accounting firms and freelancers.
   - The `/demo/company` tour has no approval step.
2. **"Book a demo" is a `mailto:support@unreceipt.com`.**
   - It sits only on `/accountants` (`_audience-page.tsx:82`) and at the end of the accountant tour.
   - For anyone on webmail or a phone without a mail app, nothing happens, and it can't be measured.
   - No navigation bar has "Demo" or "Contact".
   - The home page, freelancer pages and guides have no contact path.
   - About shows the address as plain text.
3. **No trust signals.** There are no testimonials, which is right because nothing is invented. But the real pilot firm isn't quoted, and nobody can see who is behind the product.
4. **The `/demo` tour is the best asset, and it captures no lead.**
   - The company tour ends on "Start free" only.
   - Its labels are hardcoded and ignore pilot mode.
5. **The waitlist** is on the English page only, collects only an email, has a hardcoded `source`, and has no follow-up.

### Why you can't see what works
6. **Only Vercel pageviews are recorded.**
   - No CTA clicks and no signup events are tracked.
   - UTMs are lost when a visitor goes from unreceipt.com to app.unreceipt.com.
   - Signup stores no source, so the daily digest can't say where someone came from.
   - Side issue: Vercel Analytics also runs on the app host and may send URLs that carry tokens (`/app/accountant/accept?token=`).

### Why the site is hard to find
7. **Little content, and none of the off-site work is done.**
   - 18 indexable pages and a single English guide; no guides index and no comparison pages.
   - Search Console, Bing Webmaster Tools, a LinkedIn page and Capterra are not done yet.
8. **Technical drag.**
   - The server sends `<html lang="en">` on `/sv` (`layout.tsx:124`). Bing reads it, and Bing feeds ChatGPT search and Copilot.
   - Every marketing page is `force-dynamic`, and the proxy calls Supabase `getUser()` on the marketing host too, so nothing is cached.
   - The landing page ships all three languages to the browser.
   - The Organization JSON-LD has no `sameAs`.
9. **Referrals leak.**
   - Invite and join pages send signed-out invitees to "Sign in" instead of signup (`app/connect/[code]`, `accountant/accept`, `firm-request`, `team-join`, `firm-join`).
   - No transactional email links back to unreceipt.com.

## Honest points

- **A 20-minute call per lead doesn't scale at 169–329 kr/month.** It is right now, as customer discovery. Aim for 15–20 calls, write down the objections, then make onboarding self-serve. That is why the form asks for the number of employees, the bookkeeping software and whether they have an accountant: you can then skip calls that won't fit.
- **The first objection will be "we already have Fortnox Kvitto & Utlägg / Pleo".** There is no Fortnox integration (`about.ts:126`). The page must say so plainly and show what the export does. Avoiding the subject loses the lead during the call anyway.
- **The team feature is two days old and has known gaps.** There is no payroll file, and approved receipts are deleted with the employee's account (AGENTS.md "Known gaps"). Present it as a pilot. Don't promise payroll.
- **You want people to contact you, but they can't see who they would contact.** A first name and a photo on the demo page cost nothing and are the strongest trust signal a pre-traction product has. It isn't built, by your decision; reconsider it after the first 10 requests.
- **SEO will not bring demos before roughly Q2 2027.** Requests in the next 3 months will come from your LinkedIn and outreach and from accounting firms. The site's job now is to convert the visitors you send it and to show you which channel works.

## The funnel

```
LinkedIn posts + outreach ──┐
Pilot firm referrals ───────┼─▶ /sv/smaforetag ─▶ demo tour (with approvals) ─▶ /sv/boka-demo form
Google (Swedish guides) ────┘         │                                              │
                                      └──▶ self-serve signup (always available)      ▼
                                                                    instant email to you + Cal.com slot
                                                                                     │
                                                              20-min call ─▶ pilot signup ─▶ active company
```

**Weekly numbers (15 minutes, every Monday):**

| Stage | Source |
|---|---|
| Visitors by source (LinkedIn, Google, firm, direct) | Plausible |
| CTA clicks: demo page, tour start, signup | Plausible events |
| Demo forms sent | `demo_requests` table and your inbox |
| Calls booked and held | Cal.com |
| Signups by source | Signup digest (after Step 2) |
| Active companies: ≥10 receipts and 1 employee invited within 14 days | `/admin/pilot` |

## Steps (one new conversation each, in this order)

| # | Step | Why first | Needs from you |
|---|---|---|---|
| 1 | Demo request flow | Closes the biggest gap: there is no working way to ask | Cal.com link (optional at launch) |
| 2 | Measurement and attribution | Shows which channel brings demos | Plausible account (EU) |
| 3 | Small-business page + approvals step in the tour | The audience you chose has no page | Read the Swedish copy |
| 4 | Trust: pilot firm quote | Proof on the pages that convert | The quote and permission |
| 5 | Accounting firms as referrers | One firm brings many companies | — |
| 6 | Technical SEO and performance | Faster pages, correct language for Bing and Google | LinkedIn URL for `sameAs` |
| 7 | Swedish content, one piece every 2 weeks | Compounding organic traffic | Review each piece |

### Step 1: Demo request flow
- **Pages:** `/sv/boka-demo` (primary) and `/book-demo`, registered in `MARKETING_PAGES`.
- **Form fields:** name, company, email, phone (optional), number of employees, bookkeeping software (Fortnox / Visma / Bokio / other / none), has an accountant, message.
- **Route:** `POST /api/demo-request` on the apex, modelled on `/api/waitlist`:
  - rate-limited
  - stored in a new service-role-only table `demo_requests`
  - emails you at once
  - emails a confirmation to the requester
- **After sending:** a button to your Cal.com page, prefilled (`NEXT_PUBLIC_DEMO_BOOKING_URL`; a link, not an embed).
- **Replace every `mailto` CTA** and add "Boka demo" to the nav. The company tour's end screen offers "Boka en demo" next to "Start free".
- **Done when:** a test request reaches your inbox and the table, and no `mailto:` remains in a CTA.

### Step 2: Measurement and attribution
- **Plausible**, EU-hosted and cookieless, on the marketing host. Update the CSP and the privacy page.
- **Events:** CTA click (signup, demo page, tour start), demo form sent, tour finished.
- **First touch:** `utm_*`, referrer host and landing page travel with the signup link, read at click time with no storage. They are saved on the new account and shown in the signup digest. Demo requests store the same.
- **Vercel Analytics:** add a `beforeSend` that strips query strings on the app host.
- **Done when:** a signup from `/sv?utm_source=test` shows "test" in the digest, and Plausible shows the events.

### Step 3: Page for companies with employees
- **Pages:** `/sv/smaforetag` (primary) and `/small-business`.
- **Content:**
  - employees snap and send receipts, the owner or an approver approves, approved outlays are listed to pay back, the accountant sees approved receipts only
  - an honest FAQ on Fortnox and Pleo
  - primary CTA: the demo page
- **Demo tour:** add an approval step to `/demo/company`, answered in the browser like the other steps.
- **Landing page:** the "Who it's for" card links here.

### Step 4: Trust
- **Pilot firm quote:** a named quote block on `/sv`, `/sv/smaforetag`, `/sv/redovisningsbyra` and `/sv/boka-demo`. It is only built once you have the quote in writing and permission to publish it.
- **Founder block:** "Vem står bakom UnReceipt", only if you change your mind.

### Step 5: Accounting firms as referrers
- Invite and join pages open signup, not sign in, for people without an account.
- Transactional emails get a footer link to unreceipt.com with `utm_source=email&utm_campaign=<flow>`.
- A "Rekommendera UnReceipt till klienter" kit on `/firm/clients`: a ready Swedish email text and the client PDF.
- The firm join page says in two lines what UnReceipt is.

### Step 6: Technical SEO and performance
- Correct `lang` in the server HTML.
- No Supabase call on marketing requests.
- Marketing pages cached again.
- The landing page ships one language.
- A guides index at `/sv/guider`.
- One share image per page.
- `sameAs` with your LinkedIn page.
- IndexNow run after each deploy.

### Step 7: Swedish content
One piece every 2 weeks, each with dated sources and a CTA to the demo page:
1. "Utlägg för anställda: så hanterar du dem"
2. "Vad ska ett kvitto innehålla?"
3. "Representation och moms 2026"
4. "UnReceipt jämfört med Fortnox Kvitto & Utlägg och Pleo". Every claim about a competitor is checked on their current site and dated.

## Your checklist (no code, start this week)

- [ ] **Google Search Console:** submit `https://unreceipt.com/sitemap.xml`, then request indexing of the Swedish pages.
- [ ] **Bing Webmaster Tools:** import from Search Console, then run `node scripts/indexnow.mjs`.
- [ ] **LinkedIn company page:** create it with the one-sentence definition from `/about`, and send me the URL.
- [ ] **Google Business Profile** (service-area business, Sweden).
- [ ] **Cal.com account** (cal.eu) with a 20-minute event, "UnReceipt demo".
- [ ] **Plausible account** (EU) for unreceipt.com.
- [ ] **Pilot firm:** ask for a two-sentence quote with permission to publish it, and a link from their website.
- [ ] **LinkedIn, every week:**
  - Two posts: one problem you see (receipts, outlays, the month-end chase) and one thing you learned from a pilot user.
  - Ten personal messages to owners of Swedish companies with 3–30 employees, linking to `/sv/smaforetag?utm_source=linkedin&utm_campaign=outreach`.
  - Never send the same message twice.
- [ ] **Monday, 15 minutes:** fill in the weekly numbers above.
