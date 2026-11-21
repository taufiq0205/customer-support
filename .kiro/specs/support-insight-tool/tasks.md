# Support Insight tasks

Draft. IDs trace to the [original brief](../../../KIRO-SPEC-BRIEF-support-insight.md). Use the proposed contracts in [design.md](design.md). Close the affected owner decisions before implementation.

## 1. Agree on the contract

- [ ] **T01 · Both · R1–R8:** Agree on records, query interfaces, repeat snapshots and shared synthetic fixtures. Record Q2–Q7 decisions or gates. Include duplicate IDs, malformed rows, nullable fields, masked details, week boundaries and expected report totals.
  - [ ] **T01.1** Agree on adapter output, source-scoped identity, label versions, snapshot replacement and repository signatures.
  - [ ] **T01.2** Record Q2–Q7 plus denominator and hand-label policy. Mark the tasks each decision gates.
  - [ ] **T01.3** Create the app skeleton and local setup instructions. Ignore exports, databases, sidecars and local credentials.
  - [ ] **T01.4** Build one synthetic fixture with ticket, message, seed, daily metrics and KB inputs. Include a malformed row, a repeated snapshot, cross-source ID collisions, nullable fields and a Malaysia week boundary.
  - [ ] **T01.5** Write expected import counts, gap membership, denominators, drill-down IDs and masked output. Both developers sign off before splitting work.

## 2. Import and labels

- [ ] **T02 · Database · R1, R2, R7:** After T01 and storage approval, implement migrations, constraints and atomic snapshot writes. Verify repeat imports, overlapping IDs across sources and interrupted writes.
  - [ ] **T02.1** Choose the local database path and define repeatable migrations.
  - [ ] **T02.2** Create tables and constraints for tickets, ordered messages, model labels, hand labels, KB versions, gap runs and membership, analytics, notes and job summaries.
  - [ ] **T02.3** Index ticket identity and the classification and report query paths.
  - [ ] **T02.4** Implement atomic ticket and message replacement. Preserve the prior snapshot if a write fails.
  - [ ] **T02.5** Test migration replay, duplicate snapshots, source collisions, nullable fields and interrupted writes.
- [ ] **T03 · App · R1, R7, R8:** Build the Zaapi adapter and import command against T01, then integrate T02. Verify counts, latest imported date, invalid-row diagnostics and that attachment URLs are discarded.
  - [ ] **T03.1** Expose the source flag and route Zaapi through the adapter contract.
  - [ ] **T03.2** Stream JSONL line by line. Validate ticket fields, UTC timestamps and ordered messages. Keep only an attachment presence flag.
  - [ ] **T03.3** Skip malformed or invalid rows with line number and safe reason. Keep file and database failures distinct from skipped rows.
  - [ ] **T03.4** Print read, inserted, updated, skipped and imported date range. Return the latest imported date from stored tickets.
  - [ ] **T03.5** Run first and repeat imports on the shared fixture and compare counts and stored snapshots.
- [ ] **T04 · Database · R2, R3:** After T02, seed `zaapi-haiku-v0` and add missing-label and hand-label interfaces. Reconcile 20,216 export tickets and 20,215 seed rows by ID.
  - [ ] **T04.1** Parse the legacy seed CSV and join records by Zaapi ticket ID.
  - [ ] **T04.2** Validate seed labels and record provenance under zaapi-haiku-v0. Mark legacy staff attribution as inferred.
  - [ ] **T04.3** Report invalid and duplicate rows, unknown ticket IDs and tickets with no seed. Reconcile the 20,216 and 20,215 inputs locally by ID.
  - [ ] **T04.4** Query tickets missing valid labels for the chosen version. Keep old versions readable.
  - [ ] **T04.5** Add hand-label writes and history reads. Test seed replay and verify zero model calls.
- [ ] **T05 · App · R2, R7:** Build shared redaction after T01. Verify names, addresses, emails, MY/SG phones, order numbers and fail-closed handling with synthetic text.
  - [ ] **T05.1** Confirm order-number patterns with approved local evidence. Add synthetic examples for each redaction rule.
  - [ ] **T05.2** Mask emails, MY/SG phone formats, names, addresses, postcodes and order numbers in summaries and messages.
  - [ ] **T05.3** Use known sender names and approved text detectors. Withhold text when safe masking cannot be established.
  - [ ] **T05.4** Test the model payload, display and export paths using synthetic private values. Check that diagnostics contain no raw text or attachment URLs.
- [ ] **T06 · App · R2, R3:** After T04–T05 and Q3–Q5 plus model approval, validate labels, track cost, resume interrupted runs and store staff evidence. Add stratified sample review, agreement and confused-pair output. Verify invalid labels retry and hand labels persist.
  - [ ] **T06.1** Select summary text or customer messages, mask locally and send only safe text. Load model credentials locally.
  - [ ] **T06.2** Version the prompt and model together. Validate exactly one allowed reason and outcome per ticket. Apply the approved staff-evidence policy and store unknown where needed.
  - [ ] **T06.3** Persist valid labels as results arrive. Record usage and cost. Leave invalid or missing results eligible for retry and test interrupted runs.
  - [ ] **T06.4** Select 100 labelled chats randomly across reasons. Show masked text and model labels, collect hand labels and retain them for regression.
  - [ ] **T06.5** Report reason and outcome agreement and the most-confused pairs. Verify the 85% and 80% thresholds on known results.

## 3. Gaps and reports

- [ ] **T07 · App + Database · R4, R7:** After T02 and KB baseline approval, parse Q&A and product files into versioned entries. After T05–T06 and method approval, publish complete gap runs. Verify rollback to prior results, distinct chat counts, masked examples and Markdown/CSV exports.
  - [ ] **T07.1** Parse Q&A headings and product Markdown/XLSX into stable, versioned entries for the approved KB snapshot.
  - [ ] **T07.2** Select unresolved and no-reply tickets for the chosen classifier version. Mask and group their customer questions.
  - [ ] **T07.3** Retrieve close KB entries and assign covered, partial or uncovered. Record the KB version, method, counts and spend.
  - [ ] **T07.4** Store the topics and distinct ticket membership. Publish the run atomically and test that failure leaves the previous run readable.
  - [ ] **T07.5** Rank up to 20 partial or uncovered topics. Show the question, reason, count, closest entry and up to three masked examples. Verify Markdown and CSV output.
- [ ] **T08 · Database · R5, R6:** After T02 and report policy approval, implement ISO-week queries, shared drill-down filters, daily Zaapi metrics and notes. Verify the counts and denominators against T01.
  - [ ] **T08.1** Normalize daily Zaapi CSV dates, account names, channels, counts and reported rates. Cross-check daily ticket counts against the import.
  - [ ] **T08.2** Bucket ticket opens by Malaysia ISO week. Return total chats, four outcome counts and shares, label coverage and the approved rate denominator.
  - [ ] **T08.3** Apply version, week, channel, reason, outcome, empty and gap filters consistently to totals and paged ticket queries.
  - [ ] **T08.4** Provide ordered ticket detail, gap membership and dated note queries and writes.
  - [ ] **T08.5** Test ISO year and week boundaries, missing labels, empty and low-volume slices and count-to-ticket parity.
- [ ] **T09 · App · R4–R7:** After UI approval and T05, T07–T08, wire up gaps, trends and drill-down. Verify the empty toggle, <30 flag, rate overlay, gap membership, masked default, explicit reveal and hand corrections.
  - [ ] **T09.1** Start the approved UI on 127.0.0.1. Show the latest imported date and a clear empty state.
  - [ ] **T09.2** Build weekly trends with four outcome shares, reason and channel filters, the empty toggle, dated note markers and the flag below 30 chats. Plot daily Zaapi AI rates separately.
  - [ ] **T09.3** Show ranked gaps and export actions. Route each gap and selected chart value to its matching ticket list.
  - [ ] **T09.4** Show ticket number, date, channel, labels and masked summary. Show ordered masked messages and require an explicit local reveal for originals.
  - [ ] **T09.5** Add label correction as a hand-label write. Verify reveal resets on ticket change and report counts match the selected list.

## 4. Refresh and pilot

- [ ] **T10 · Both · R7, R8:** After T03 and T06–T09, wire refresh and document setup, commands, exports, backups and recovery. On the shared fixture, repeat refresh and verify import, totals and drill-down together.
  - [ ] **T10.1** Expose one command each for import, classify, gaps, sample and app.
  - [ ] **T10.2** Wire refresh in import → classify → gaps order. Stop on stage failure and preserve completed work for retry.
  - [ ] **T10.3** Print stage counts, elapsed time and cost. Show zero spend for commands without model calls.
  - [ ] **T10.4** Document setup, adding exports, local keys, backup and restore for hand labels and notes, and recovery after interruption.
  - [ ] **T10.5** Run refresh twice with the shared fixture. Verify stable import totals, label reuse, gap state and drill-down counts.
- [ ] **T11 · Both + reviewer · R1–R8, G1–G5:** After T10 and reviewer assignment, run the local pilot. Record separate import, classification and combined times, page times, classification and gap spend, and 100-chat agreement. Verify the ranked gap output, trend filters and masked paths. Log threshold misses before launch.
  - [ ] **T11.1** Run local privacy checks for the bind address, ignored inputs and sidecars, masked payloads and exports, and attachment URLs.
  - [ ] **T11.2** Measure import of 20,000 tickets under 5 minutes, classification under 15 minutes and the combined run under 15 minutes. Measure each separately.
  - [ ] **T11.3** Record classification spend under USD 5, gap spend at most USD 3 and page loads under 2 seconds.
  - [ ] **T11.4** Have the assigned reviewer label 100 chats. Record reason agreement at least 85%, outcome agreement at least 80% and confused pairs.
  - [ ] **T11.5** Check gap examples, trend filters, count parity and the displayed date. Record launch gate misses. Track the 23% business baseline separately.
