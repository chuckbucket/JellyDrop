import type { LibraryDTO } from "@shared/types";
import { jellyfinClient } from "../jellyfin/client";
import { mapLibrary } from "../utils/mappers";

export async function getLibraries(): Promise<LibraryDTO[]> {
  const folders = await jellyfinClient.getVirtualFolders();
  return folders.map(mapLibrary).filter((library): library is LibraryDTO => library !== null);
}

export async function getLibraryById(libraryId: string): Promise<LibraryDTO | null> {
  const libraries = await getLibraries();
  return libraries.find((library) => library.id === libraryId) ?? null;
}
