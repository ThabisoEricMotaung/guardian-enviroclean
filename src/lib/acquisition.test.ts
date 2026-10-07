import { describe, expect, it } from "vitest";
import {
  NO_ACQUISITION,
  acquisitionFromSearch,
  captureAcquisition,
  normaliseSubmittedAcquisition,
  readStoredAcquisition,
} from "./acquisition";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const tagged = (content: string) =>
  `?utm_source=facebook&utm_medium=social&utm_content=${content}`;

describe("acquisitionFromSearch", () => {
  it.each(["page_button", "post", "bio"] as const)(
    "recognises the tagged Facebook %s link",
    (placement) => {
      expect(acquisitionFromSearch(tagged(placement))).toEqual({
        channel: "FACEBOOK",
        detail: placement,
      });
    },
  );

  it("tolerates case/whitespace in utm_source", () => {
    expect(acquisitionFromSearch("?utm_source=%20Facebook%20&utm_content=post")).toEqual({
      channel: "FACEBOOK",
      detail: "post",
    });
  });

  it.each([
    "?utm_source=facebook&utm_content=story",
    "?utm_source=facebook&utm_content=POST",
    "?utm_source=facebook&utm_content=post%3Cscript%3E",
    "?utm_source=facebook&utm_content=",
    "?utm_source=facebook",
  ])("keeps the channel but drops a malformed/unsupported placement: %s", (search) => {
    expect(acquisitionFromSearch(search)).toEqual({ channel: "FACEBOOK", detail: null });
  });

  it.each([
    "?utm_source=faceb00k&utm_content=post",
    "?utm_source=instagram&utm_content=bio",
    "?utm_source=google&utm_medium=cpc",
    "?utm_source=&utm_content=post",
    "?utm_content=page_button",
  ])("returns NULL for an unsupported or malformed channel: %s", (search) => {
    expect(acquisitionFromSearch(search)).toEqual(NO_ACQUISITION);
  });

  it("returns NULL when there is no attribution at all", () => {
    expect(acquisitionFromSearch("")).toEqual(NO_ACQUISITION);
    expect(acquisitionFromSearch("?service=mattress")).toEqual(NO_ACQUISITION);
  });

  it.each([
    "?fbclid=IwAR0abcDEF123",
    "?fbclid=IwAR0abc&utm_content=post",
    "?fbclid=IwAR0abc&utm_medium=social&utm_content=page_button",
    "?utm_source=instagram&fbclid=IwAR0abc",
  ])("never establishes Facebook from fbclid without the facebook tag: %s", (search) => {
    expect(acquisitionFromSearch(search)).toEqual(NO_ACQUISITION);
  });

  it("ignores fbclid on a tagged link", () => {
    const result = acquisitionFromSearch(`${tagged("page_button")}&fbclid=IwAR0abcDEF123`);
    expect(result).toEqual({ channel: "FACEBOOK", detail: "page_button" });
    expect(JSON.stringify(result)).not.toContain("IwAR0abcDEF123");
  });

  it("never carries arbitrary UTM values through", () => {
    const result = acquisitionFromSearch(
      "?utm_source=facebook&utm_medium=evil-medium&utm_campaign=spring-sale&utm_term=x&utm_content=post&fbclid=IwAR0xyz",
    );
    expect(result).toEqual({ channel: "FACEBOOK", detail: "post" });
    expect(JSON.stringify(result)).not.toMatch(/evil-medium|spring-sale|IwAR0xyz|utm_/);
  });
});

describe("normaliseSubmittedAcquisition", () => {
  it.each(["page_button", "post", "bio"] as const)("accepts FACEBOOK + %s", (placement) => {
    expect(normaliseSubmittedAcquisition("FACEBOOK", placement)).toEqual({
      channel: "FACEBOOK",
      detail: placement,
    });
  });

  it("accepts FACEBOOK with no placement", () => {
    expect(normaliseSubmittedAcquisition("FACEBOOK", null)).toEqual({
      channel: "FACEBOOK",
      detail: null,
    });
  });

  it.each([["OTHER"], ["DIRECT"], ["GOOGLE"], ["facebook"], [" FACEBOOK"], [""], [null], [42], [{}]])(
    "rejects channel %j",
    (channel) => {
      expect(normaliseSubmittedAcquisition(channel, "post")).toEqual(NO_ACQUISITION);
    },
  );

  it.each([["story"], ["POST"], ["utm_content=post"], [""], [42]])(
    "drops placement %j but keeps FACEBOOK",
    (detail) => {
      expect(normaliseSubmittedAcquisition("FACEBOOK", detail)).toEqual({
        channel: "FACEBOOK",
        detail: null,
      });
    },
  );

  it("never accepts a placement without FACEBOOK", () => {
    expect(normaliseSubmittedAcquisition(null, "post")).toEqual(NO_ACQUISITION);
  });
});

describe("sessionStorage persistence", () => {
  it("survives browsing: landing on the homepage, then reading on the quote page", () => {
    const storage = memoryStorage();
    captureAcquisition(tagged("post"), storage); // landing
    captureAcquisition("", storage); // untagged page view later in the tab
    expect(readStoredAcquisition(storage)).toEqual({ channel: "FACEBOOK", detail: "post" });
  });

  it("stores only the normalised values, never raw UTM or fbclid", () => {
    const storage = memoryStorage();
    captureAcquisition(`${tagged("bio")}&utm_campaign=secret-campaign&fbclid=IwAR0raw`, storage);
    const raw = [...storage.data.values()].join("");
    expect(raw).not.toMatch(/secret-campaign|IwAR0raw|utm_/);
  });

  it.each(["?utm_source=google", "?fbclid=IwAR0abc", ""])(
    "writes nothing for an unattributed visit: %j",
    (search) => {
      const storage = memoryStorage();
      captureAcquisition(search, storage);
      expect(storage.data.size).toBe(0);
      expect(readStoredAcquisition(storage)).toEqual(NO_ACQUISITION);
    },
  );

  it("an fbclid-only page view later in the tab neither sets nor erases attribution", () => {
    const storage = memoryStorage();
    captureAcquisition(tagged("bio"), storage);
    captureAcquisition("?fbclid=IwAR0abc", storage);
    expect(readStoredAcquisition(storage)).toEqual({ channel: "FACEBOOK", detail: "bio" });
  });

  it("reads NULL from empty storage", () => {
    const storage = memoryStorage();
    expect(readStoredAcquisition(storage)).toEqual(NO_ACQUISITION);
  });

  it.each([
    "not json",
    "null",
    '"FACEBOOK"',
    '{"channel":"OTHER","detail":null}',
    '{"channel":"FACEBOOK","detail":"anything"}',
  ])("normalises a tampered stored value: %s", (stored) => {
    const storage = memoryStorage({ "guardian.acquisition": stored });
    const result = readStoredAcquisition(storage);
    expect(result.channel === null || result.channel === "FACEBOOK").toBe(true);
    expect(result.detail).toBeNull();
  });

  it("never throws when storage is unavailable", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() => captureAcquisition(tagged("post"), broken)).not.toThrow();
    expect(readStoredAcquisition(broken)).toEqual(NO_ACQUISITION);
  });
});
