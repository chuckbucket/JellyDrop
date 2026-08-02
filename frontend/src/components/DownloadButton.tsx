import { useDownloadQueue } from "../context/DownloadQueueContext";

interface DownloadButtonProps {
  id: string;
  name: string;
  downloadUrl: string;
  label?: string;
  className?: string;
}

export function DownloadButton({ id, name, downloadUrl, label = "Download", className = "" }: DownloadButtonProps) {
  const { enqueue, ensureDownloadFolder } = useDownloadQueue();

  return (
    <button
      type="button"
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        // Must come first, synchronously in this handler — showDirectoryPicker() needs a direct
        // user gesture, so this is the only place it's safe to (maybe) prompt for a folder.
        await ensureDownloadFolder();
        enqueue([{ id, name, downloadUrl }]);
      }}
      className={`rounded-md bg-[var(--color-jelly-accent)] px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-jelly-accent-hover)] ${className}`}
    >
      {label}
    </button>
  );
}
