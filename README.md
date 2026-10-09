# Ghalla Mandi: commission agent (arhti) app

An offline-first web app (installable PWA) for commission agents in a Ghalla Mandi (wholesale produce market). It runs in two versions from one codebase:

| Version | Open | Install as |
|---|---|---|
| English (LTR) | `index.html` | "Ghalla Mandi" |
| اردو (RTL, Urdu UI and slips) | `urdu.html` | "گلہ منڈی" |

Both versions share the same data on the phone, and each has a language switch in the top bar. There is no build step: plain ES modules, IndexedDB, a service worker and self-hosted fonts.

The ad page is at `promo.html`: five animated scenes in English and Urdu, with a live rate ticker and install links.

## What it does

- **Arrivals (aamad).** Record each truck: farmer, item, vehicle, driver, bags, gross weight, deduction per bag. The deduction and net weight are calculated while you type. Units are kg or maund (1 maund = 40 kg). Count-based items (crate, dozen, piece, bag) are supported too. Each lot gets a number (`AAM-000001`) and a printable arrival slip.
- **Bills (sales).** Pick a buyer, add one or more open lots, and enter quantity and rate. The rate is pre-filled from today's rate board or the last sale. Each line shows commission, market fee and what the farmer gets. You can take part-payment at the time of sale. Bills are numbered (`SAL-000001`) and printable. Quantity can never exceed what is left in a lot.
- **Cancel, don't erase.** Cancelling a bill writes reversing ledger entries and keeps the history. Standalone receipts and payments can be reversed the same way.
- **Farmers and buyers.** Balances, statements with a running balance, date ranges, print, and a WhatsApp share that opens a plain-text summary (the user taps send). Buyers can have a credit limit. Aging shows how old unpaid bills are (0–7, 8–30, 30+ days). Payments are applied to the oldest bills first.
- **Payments.** Receive from buyers, pay farmers, give advances (peshgi), and charge an expense back to a farmer (for example labour or transport on that lot).
- **Cash book and expenses.** Every rupee in and out, with a running balance, an opening cash figure, and expense categories.
- **Rate board (bhav).** Enter each item's low and high rate for the day. It scrolls as a ticker on Home and pre-fills sale rates.
- **Reports.** Commission summary (with net profit), lot-wise, farmer dues, buyer aging, expenses by category, and cash book. Each exports to CSV.
- **Security and backup.** Optional 4-digit PIN (PBKDF2-hashed, never stored in plain text). The app locks automatically after 5 minutes in the background. Backup downloads a checksummed JSON file (the PIN is never included). Restore validates the file first, then offers *merge* (adds only new records) or *replace* (requires typing `RESTORE`). Erase requires typing `ERASE`.
- **Offline.** After the first visit, the app runs without internet. Everything except the optional WhatsApp link happens on the device.

## Pain points this app is built around

The list below comes from two sources. The first is public reporting on Pakistan's wholesale markets. The second is how arhti work is commonly described, which is practitioner knowledge rather than a study. Items marked **(sourced)** have a cited basis. The rest should be checked with real agents before you rely on them.

| Pain point | Who feels it | How the app handles it |
|---|---|---|
| Buyers buying on credit and not paying (udhaar), and the agent is left holding the loss | Agent | Buyer balances, aging by days, credit limits, FIFO payment allocation, and a warning on the bill when a limit would be exceeded. **(sourced: commission agents act as informal financiers, and credit defaults have hit Peshawar agents)** |
| Agents front money to farmers while waiting for buyers to pay, and farmers wait for their dues | Agent, farmer | Farmer dues dashboard, statements, payments and advances recorded against the farmer, and what is still owed at a glance. **(sourced: agents bridging payment gaps, and payment delays hurting farmers' next season, reported in Indian Punjab mandis)** |
| Weight and deduction disputes at the gate | Farmer, agent | Bags × deduction per bag is subtracted from gross weight, and the slip shows gross, deduction and net. The farmer can sign the slip. |
| Handwritten kacha parchi is lost, unreadable or disputed | Agent, farmer | Numbered, printable arrival and sale slips in Urdu or English. Reprint at any time. |
| Commission rates applied inconsistently | Agent | Default commission per item, with per-item override. Each bill line shows the rate used. |
| Daily rates change and sales are priced from memory | Agent | Rate board with low and high per item, shown as a ticker, pre-fills sale rates, and records the last sold rate. |
| Expenses (coolie, transport, tea) are unrecorded or disputed | Agent, farmer | Expense log with categories, optional lot link, and an option to charge the cost to the farmer's dues. |
| Cash does not match at closing | Agent | Cash book with opening cash, a running balance, and every receipt, payment, advance and expense in one list. |
| Digital ledgers and mandi systems are mostly for admins or cloud subscriptions | Agent | Local-first app with no subscription. **(sourced: PAMRA is piloting a digital mandi system in Lahore, and a commercial arhti ledger exists, "Pakka Khata", with no independent reviews)** |
| Staff or family members change records | Agent | PIN lock, auto-lock, and reversal (not deletion) for every cancelled bill and payment. |
| Records lost with a phone | Agent | Backup file with validation, merge or replace restore, and a reminder on Home when there has been no backup for 7 days. |
| Poor or no network in the market | Everyone | Offline-first app with cached shell and local database. |
| Urdu-speaking staff cannot use English software | Agent, staff | Full Urdu interface with right-to-left layout, Urdu slips, and an Urdu item name field. |

**Sources**

- Commission agents as credit providers, and their role in credit and price control: [PBC, *Transforming Agricultural Markets in Pakistan*](https://www.pbc.org.pk/research/transforming-agricultural-markets-in-pakistan/) and [Propakistani, CCP urges uninterrupted supply of essential commodities (2021)](https://propakistani.pk/2021/07/31/ccp-urges-federal-provincial-govts-to-to-ensure-uninterrupted-supply-of-essential-commodities/).
- Buyer defaults at Peshawar's Inqilab Road market: [Tribune, *Afghan vegetable importers default on payments*](https://tribune.com.pk/story/357172/afghan-vegetable-importers-default-on-payments). This is a 2012-era report, so treat it as dated.
- Digital mandi system in Lahore: [PITB, meeting on digital mandi system for PAMRA](https://pitb.gov.pk/node/10868) and [Zameen, Lahore to get digital vegetable and fruit market](https://www.zameen.com/news/lahore-to-get-digital-vegetable-fruit-market.html). The rollout status after August 2025 was not confirmed.
- Commercial arhti ledger: [Pakka Khata on G2](https://www.g2.com/sellers/techzoq). It had no reviews when checked.
- Payment delays and arhtiyas front-funding farmers (Indian Punjab, used as an analogy): [Tribune India](https://www.tribuneindia.com/news/archive/features/fazilka-arhtiyas-protest-delay-in-payment-by-govt-agencies-242197).

I did not find recent Pakistani studies on udhaar recovery, legal recovery routes, or market-committee fee rules. Please check those with your own market association before you rely on the defaults.

## Assumptions to review

These are choices I made. Each one is a single setting or a single line of code to change.

1. **Default commission is 6%.** It is a placeholder. Set your market's rate in *Settings → Defaults*, and override it per item when needed.
2. **Market committee fee is 0% by default.** Set it in *Settings → Defaults*. It is deducted from the farmer's share.
3. **Commission and market fee are charged to the farmer.** The buyer pays the bill total. The farmer receives the bill total minus commission minus market fee. If your market charges the buyer as well, that needs a change in `js/store.js` (`computeLine`).
4. **One maund = 40 kg.** This is fixed in `js/store.js` (`MAUND_KG`).
5. **Digits stay Latin (0–9) in both languages**, and amounts use South Asian grouping (1,23,456). This keeps bills unambiguous.
6. **Ten seed items** (tomato, onion, potato, garlic, ginger, green chilli, okra, cauliflower, cabbage, mango, banana) are added on first run. Edit or hide them in *Settings → Items*.

## Data and privacy

- All records live in IndexedDB on the phone (`ghallamandi_app`). Nothing is sent to a server.
- The app has no login server. The PIN is a local lock, not account security. Anyone with the unlocked phone can see the data.
- Backups are plain JSON files that contain every record (farmers' phone numbers included). Store them safely.
- The WhatsApp button only opens `wa.me` with a summary. Nothing is sent without the user tapping send.

## Running it

It needs to be served over HTTP (ES modules and the service worker). From the repository root:

```bash
python -m http.server 8080
```

Then open http://localhost:8080/ghallamandi/index.html (English) or http://localhost:8080/ghallamandi/urdu.html (اردو).

On a phone, use HTTPS (GitHub Pages or any HTTPS host) and choose *Add to home screen* in the browser menu. Install both versions if you want both on the home screen.

### Files

```
index.html              English entry (LTR)
urdu.html               Urdu entry (RTL), same app
promo.html              Animated bilingual ad
manifest-en.json        PWA manifest, English
manifest-ur.json        PWA manifest, Urdu
service-worker.js       Offline shell cache (bump VERSION when files change)
css/app.css             Design system (themes, RTL, motion, print)
fonts/                  Jameel Noori Nastaleeq (Urdu), shared with the POS app
icons/                  App icons
js/i18n.js              All English and Urdu strings
js/db.js                IndexedDB wrapper; one transaction per money action
js/store.js             Business rules: lots, bills, ledger, cash, backup
js/util.js              Dates, numbers, CSV, helpers
js/ui.js                Icons, sheets, toasts, counters, charts, ticker
js/auth.js              PIN hashing and checking
js/gate.js              First-run setup and PIN lock screens
js/print.js             Arrival slip, sale bill and statement
js/router.js            Hash router
js/main.js              Boot, shell, navigation, auto-lock
js/views/               Home, lots, sales, parties, cash, rates, reports, settings
```

## Checks run

- Business rules tested in a browser against the real modules: net weight, bill totals, commission, farmer share, over-quantity rejection, expense charged to farmer, payment and receipt balances, cash book, void and reversal, FIFO aging, statement totals, backup checksum, and rejection of a malformed backup. All pass.
- Forms driven through the real controls: new arrival (net weight preview and save), bill composer (board-rate pre-fill, part payment, save), expense sheet, rate board, and PIN set, check and clear.
- All English screens (home, arrivals, sales, parties, statements, cash book, rate board, reports, settings) load without runtime errors. Urdu (RTL) was checked on the home screen only. Light and dark themes were both checked on the home screen.
- Slips (arrival, bill, statement) generate correctly. I did not check the printed paper layout, and the Urdu slip layout is untested.
- **Not verified:** installation and offline behaviour. Service workers could not be registered in the test browser pane, so the offline cache was not exercised. Test install and offline use on a real Android phone before going live.

## Known limits

- **Single device.** There is no sync between phones. Use backup and merge to move data between phones.
- **No login server.** See *Data and privacy*.
- **The Jameel font is large** (about 9 MB), and the service worker caches it for offline use. It is the same font the POS app uses, and its licence allows embedding for preview and print.
- **Reports are computed on the device.** A very large history (tens of thousands of records) may feel slow on older phones.
