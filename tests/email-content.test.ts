import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildSubmissionEmail,
  isEmail,
  parseRecipients,
  submissionSubject,
  type SubmissionEmailInput,
} from "../src/lib/email-content";

function input(over: Partial<SubmissionEmailInput> = {}): SubmissionEmailInput {
  return {
    orgName: "PG1 Restaurants",
    checklistName: "Food Safety Audit",
    storeCode: "4049",
    storeName: "Hixson",
    localDate: "Thursday, May 21, 2026",
    submittedBy: "Rudy Rojas",
    score: 98.18,
    passed: true,
    criticalFailure: false,
    itemsFailed: 1,
    itemsTotal: 55,
    failures: [
      {
        section: "ICE MACHINE PROFESSIONALLY CLEANED",
        label: "Was documentation provided?",
        note: "No paperwork on file from the vendor",
        reading: null,
        critical: false,
      },
    ],
    url: "https://checklists.pg1.test/submissions/abc",
    ...over,
  };
}

test("the subject carries store, checklist and score", () => {
  assert.equal(
    submissionSubject(input()),
    "Food Safety Audit — #4049 Hixson — 98.18%",
  );
});

test("a failing audit says so in the subject", () => {
  assert.match(submissionSubject(input({ passed: false })), /^\[FAILED\] /);
});

test("a critical failure outranks the score in the subject", () => {
  const subject = submissionSubject(
    input({ criticalFailure: true, passed: false, score: 94.55 }),
  );
  assert.match(subject, /^\[CRITICAL\] /);
  assert.match(subject, /94\.55%/);
});

test("an unscored checklist does not claim a score", () => {
  assert.match(submissionSubject(input({ score: null })), /no score$/);
});

test("the body names what failed, with the note that was written", () => {
  const { text, html } = buildSubmissionEmail(input());
  assert.match(text, /Was documentation provided\?/);
  assert.match(text, /No paperwork on file from the vendor/);
  assert.match(text, /ICE MACHINE PROFESSIONALLY CLEANED/);
  assert.match(html, /Was documentation provided\?/);
});

test("a temperature failure reports the reading that caused it", () => {
  const { text, html } = buildSubmissionEmail(
    input({
      failures: [
        {
          section: "TEMPERATURE LOG",
          label: "Walk-In (Product)",
          note: null,
          reading: "47 °F",
          critical: true,
        },
      ],
      criticalFailure: true,
      passed: false,
    }),
  );
  assert.match(text, /recorded 47 °F/);
  assert.match(text, /\[CRITICAL\]/);
  assert.match(html, /47 °F/);
  assert.match(html, /CRITICAL/);
});

test("a clean audit says nothing failed rather than showing an empty list", () => {
  const { text, html } = buildSubmissionEmail(
    input({ failures: [], itemsFailed: 0, score: 100 }),
  );
  assert.match(text, /Nothing failed\./);
  assert.match(html, /Nothing failed\./);
  assert.doesNotMatch(text, /What failed/);
});

test("the link is left out when no public address is configured", () => {
  const { text, html } = buildSubmissionEmail(input({ url: null }));
  assert.doesNotMatch(text, /See the full submission/);
  assert.doesNotMatch(html, /See the full submission/);
});

test("text written by a store cannot inject markup into the email", () => {
  const { html } = buildSubmissionEmail(
    input({
      failures: [
        {
          section: "TEAM",
          label: "Uniform check",
          note: '<img src=x onerror="alert(1)">',
          reading: null,
          critical: false,
        },
      ],
    }),
  );
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test("recipients are split on commas, spaces and semicolons", () => {
  const { emails, invalid } = parseRecipients(
    "marcus@pg1.com, ops@pg1.com; area@pg1.com\nrd@pg1.com",
  );
  assert.deepEqual(emails, ["marcus@pg1.com", "ops@pg1.com", "area@pg1.com", "rd@pg1.com"]);
  assert.deepEqual(invalid, []);
});

test("recipients are de-duplicated regardless of case", () => {
  const { emails } = parseRecipients("Marcus@PG1.com, marcus@pg1.com");
  assert.deepEqual(emails, ["marcus@pg1.com"]);
});

test("a typo is reported rather than silently dropped", () => {
  const { emails, invalid } = parseRecipients("good@pg1.com, marcus@, @pg1.com, plain");
  assert.deepEqual(emails, ["good@pg1.com"]);
  assert.deepEqual(invalid, ["marcus@", "@pg1.com", "plain"]);
});

test("an empty list is not an error", () => {
  assert.deepEqual(parseRecipients("   "), { emails: [], invalid: [] });
});

test("address checking catches the mistakes people actually make", () => {
  assert.ok(isEmail("audits@pg1restaurants.com"));
  assert.ok(isEmail("first.last+audits@pg1restaurants.co.uk"));
  assert.ok(!isEmail("audits@pg1restaurants"));
  assert.ok(!isEmail("audits @pg1restaurants.com"));
  assert.ok(!isEmail("audits@@pg1restaurants.com"));
  assert.ok(!isEmail(""));
});
