import { afterEach, describe, expect, test } from "bun:test";

import "../test/happy-dom";
import "../test/jsx-factory";

import { Button } from "./button";
import { Skeleton } from "./skeleton";

// Loaded dynamically so happy-dom's DOM globals exist before the testing
// library captures `document`.
const { cleanup, fireEvent, render } = await import("@testing-library/react");

afterEach(() => {
  cleanup();
});

describe("Button", () => {
  test("invokes onClick when clicked", () => {
    let clickCount = 0;

    const view = render(
      <Button
        onClick={() => {
          clickCount += 1;
        }}
      >
        Save
      </Button>,
    );

    fireEvent.click(view.getByRole("button", { name: "Save" }));

    expect(clickCount).toBe(1);
  });

  test("disables the rendered button when disabled", () => {
    const view = render(<Button disabled>Saving</Button>);

    const button = view.getByRole("button", { name: "Saving" });

    expect(button.hasAttribute("disabled")).toBe(true);
  });
});

describe("Skeleton", () => {
  test("merges the caller className with the base styles", () => {
    const view = render(<Skeleton className="h-4 w-32" data-testid="skeleton" />);

    const skeleton = view.getByTestId("skeleton");

    expect(skeleton.className).toContain("animate-pulse");
    expect(skeleton.className).toContain("h-4");
  });
});
