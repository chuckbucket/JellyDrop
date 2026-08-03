import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DownloadButton } from "./DownloadButton";

// This project doesn't enable Vitest's `globals` config, so testing-library's auto-cleanup (which
// relies on detecting a global `afterEach`) doesn't register itself — without this, each test's
// rendered DOM would leak into the next within this file.
afterEach(cleanup);

describe("DownloadButton", () => {
  it("downloads at 'original' quality on a plain click of the main button", () => {
    const onDownload = vi.fn();
    render(<DownloadButton onDownload={onDownload} />);

    fireEvent.click(screen.getByText("Download"));

    expect(onDownload).toHaveBeenCalledWith("original");
  });

  it("opens a quality menu from the attached caret, and picking one downloads at that quality", () => {
    const onDownload = vi.fn();
    render(<DownloadButton onDownload={onDownload} />);

    fireEvent.click(screen.getByLabelText("Choose download quality"));
    fireEvent.click(screen.getByText("720p"));

    expect(onDownload).toHaveBeenCalledWith("720p");
    expect(onDownload).toHaveBeenCalledTimes(1);
    // Menu closes after picking an option.
    expect(screen.queryByText("1080p")).toBeNull();
  });

  it("closes the menu on an outside click without triggering a download", () => {
    const onDownload = vi.fn();
    render(
      <div>
        <DownloadButton onDownload={onDownload} />
        <button type="button">elsewhere</button>
      </div>
    );

    fireEvent.click(screen.getByLabelText("Choose download quality"));
    expect(screen.queryByText("480p")).not.toBeNull();

    fireEvent.mouseDown(screen.getByText("elsewhere"));

    expect(screen.queryByText("480p")).toBeNull();
    expect(onDownload).not.toHaveBeenCalled();
  });
});
