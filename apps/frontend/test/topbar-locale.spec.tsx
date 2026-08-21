// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

import Topbar from "@/components/layout/Topbar";
import { LocaleProvider } from "@/lib/i18n/locale-context";

/**
 * Guards the locale control against a second silent disappearance.
 *
 * `AppNav` used to own the switcher for signed-in pages. When the authenticated
 * shell moved to Sidebar + Topbar the control was not carried across, which
 * removed the only way to change language once signed in — caught by the Home
 * RTL end-to-end test, but only there, and only in an environment able to run
 * a browser.
 *
 * These assertions mirror that E2E contract at the component level: the real
 * `LocaleSwitcher` inside the real `LocaleProvider`, with nothing mocked, so a
 * regression fails fast in the ordinary unit run.
 */
describe("Topbar locale control", () => {
  beforeEach(() => {
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
    document.cookie = "stratalign_locale=; path=/; max-age=0";
  });

  afterEach(() => cleanup());

  function renderTopbar(initialLocale: "en" | "ar" = "en") {
    return render(
      <LocaleProvider initialLocale={initialLocale}>
        <Topbar email="viewer@example.test" name="Executive Viewer" />
      </LocaleProvider>,
    );
  }

  it("renders the real locale control in the authenticated shell", () => {
    const { container } = renderTopbar();

    // The exact selector the Home E2E drives.
    const switcher = container.querySelector("#locale-switcher");
    expect(switcher).not.toBeNull();
    expect(switcher?.tagName).toBe("SELECT");
  });

  it("offers exactly the supported locales, defaulting to English", () => {
    const { container } = renderTopbar();
    const switcher = container.querySelector("#locale-switcher") as HTMLSelectElement;

    expect([...switcher.options].map((option) => option.value)).toEqual(["en", "ar"]);
    expect(switcher.value).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("switching to Arabic mirrors the document, as the RTL contract requires", () => {
    const { container } = renderTopbar();
    const switcher = container.querySelector("#locale-switcher") as HTMLSelectElement;

    fireEvent.change(switcher, { target: { value: "ar" } });

    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(switcher.value).toBe("ar");
  });

  it("switching back to English restores the default direction", () => {
    const { container } = renderTopbar("ar");
    const switcher = container.querySelector("#locale-switcher") as HTMLSelectElement;

    fireEvent.change(switcher, { target: { value: "en" } });

    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("persists the choice to the locale cookie", () => {
    const { container } = renderTopbar();
    const switcher = container.querySelector("#locale-switcher") as HTMLSelectElement;

    fireEvent.change(switcher, { target: { value: "ar" } });

    expect(document.cookie).toContain("stratalign_locale=ar");
  });

  it("renders exactly one locale control, not a duplicate pair", () => {
    const { container } = renderTopbar();

    expect(container.querySelectorAll("#locale-switcher")).toHaveLength(1);
  });
});
