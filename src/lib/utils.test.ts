import { describe, expect, it } from "vitest";
import {
  cn,
  formatDate,
  generateStudyBrief,
  recommendationLabel,
  studyStatusLabel,
} from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("deduplicates conflicting tailwind classes, keeping the last", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles conditional and falsy values", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });
});

describe("formatDate", () => {
  it("returns an em dash for null/undefined/empty", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
  });

  it("formats a valid ISO date as Mon D, YYYY", () => {
    const result = formatDate("2024-01-15T00:00:00Z");
    expect(result).toMatch(/Jan.*15.*2024/);
  });
});

describe("studyStatusLabel", () => {
  it("maps known statuses to human labels", () => {
    expect(studyStatusLabel("draft")).toBe("Draft");
    expect(studyStatusLabel("pending_review")).toBe("Pending review");
    expect(studyStatusLabel("completed")).toBe("Completed");
  });

  it("returns the raw status for unknown values", () => {
    expect(studyStatusLabel("weird")).toBe("weird");
  });
});

describe("recommendationLabel", () => {
  it("maps known recommendations", () => {
    expect(recommendationLabel("ship")).toBe("Ship");
    expect(recommendationLabel("kill")).toBe("Do not ship");
    expect(recommendationLabel("borrow")).toBe("Borrow elements");
    expect(recommendationLabel("test")).toBe("A/B test");
  });

  it("returns the raw value for unknown recommendations", () => {
    expect(recommendationLabel("maybe")).toBe("maybe");
  });
});

describe("generateStudyBrief", () => {
  it("includes study name, product, and target user", () => {
    const brief = generateStudyBrief({
      name: "Signup Test",
      productName: "Acme",
      productDescription: "A SaaS tool",
      targetUserRole: "Engineer",
    });
    expect(brief).toContain("Study: Signup Test");
    expect(brief).toContain("Acme");
    expect(brief).toContain("Engineer");
  });

  it("includes variants when provided", () => {
    const brief = generateStudyBrief({
      name: "Test",
      variants: [
        { label: "A", name: "Alpha", hypothesis: "clearer headline" },
        { label: "B", name: "Beta" },
      ],
    });
    expect(brief).toContain("Variants:");
    expect(brief).toContain("A: Alpha — clearer headline");
    expect(brief).toContain("B: Beta");
  });

  it("replaces underscores in the primary objective", () => {
    const brief = generateStudyBrief({
      name: "Test",
      primaryObjective: "maximize_signup",
    });
    expect(brief).toContain("maximize signup");
  });

  it("falls back to placeholders for missing fields", () => {
    const brief = generateStudyBrief({ name: "Test" });
    expect(brief).toContain("(not specified)");
  });

  it("includes key questions and known concerns when present", () => {
    const brief = generateStudyBrief({
      name: "Test",
      contextQuestions: "Which is clearer?",
      contextConcerns: "Small sample",
    });
    expect(brief).toContain("Key questions:");
    expect(brief).toContain("Which is clearer?");
    expect(brief).toContain("Known concerns:");
    expect(brief).toContain("Small sample");
  });
});
