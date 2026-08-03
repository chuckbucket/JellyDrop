import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SizeOption } from "@shared/types";
import { DownloadButton } from "./DownloadButton";

// This project doesn't enable Vitest's `globals` config, so testing-library's auto-cleanup (which
// relies on detecting a global `afterEach`) doesn't register itself — without this, each test's
// rendered DOM would leak into the next within this file.
afterEach(cleanup);

const sizeOptions: SizeOption[] = [
  { quality: "small", estimatedBytes: 100 * 1024 * 1024 },
  { quality: "medium", estimatedBytes: 200 * 1024 * 1024 },
  { quality: "large", estimatedBytes: 400 * 1024 * 1024 },
];

describe("DownloadButton", () => {
  it("downloads at 'original' quality on a plain click of the main button", () => {
    const onDownload = vi.fn();
    render(<DownloadButton onDownload={onDownload} sizeOptions={sizeOptions} />);

    fireEvent.click(screen.getByText("Download"));

    expect(onDownload).toHaveBeenCalledWith("original");
  });

  it("opens a size menu from the attached caret, and picking one downloads at that quality", () => {
    const onDownload = vi.fn();
    render(<DownloadButton onDownload={onDownload} sizeOptions={sizeOptions} />);

    fireEvent.click(screen.getByLabelText("Choose a smaller download size"));
    fireEvent.click(screen.getByText("~200.0 MB"));

    expect(onDownload).toHaveBeenCalledWith("medium");
    expect(onDownload).toHaveBeenCalledTimes(1);
    // Menu closes after picking an option.
    expect(screen.queryByText("~100.0 MB")).toBeNull();
  });

  it("closes the menu on an outside click without triggering a download", () => {
    const onDownload = vi.fn();
    render(
      <div>
        <DownloadButton onDownload={onDownload} sizeOptions={sizeOptions} />
        <button type="button">elsewhere</button>
      </div>
    );

    fireEvent.click(screen.getByLabelText("Choose a smaller download size"));
    expect(screen.queryByText("~100.0 MB")).not.toBeNull();

    fireEvent.mouseDown(screen.getByText("elsewhere"));

    expect(screen.queryByText("~100.0 MB")).toBeNull();
    expect(onDownload).not.toHaveBeenCalled();
  });

  it("shows 'Already small' and no dropdown when there are no size options to offer", () => {
    const onDownload = vi.fn();
    render(<DownloadButton onDownload={onDownload} sizeOptions={[]} />);

    expect(screen.queryByLabelText("Choose a smaller download size")).toBeNull();
    expect(screen.getByText("Already small")).toBeTruthy();
  });
});
