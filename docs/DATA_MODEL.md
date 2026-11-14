# WordLoop — local data model (Folder → Deck → Card)

**Since:** Issue #15, first data batch (no UI yet). All data stays in the browser's IndexedDB; nothing here is sent to the Worker or D1.

## Storage
IndexedDB database `wordloop-local-v1`, **schema version 1 (unchanged)**:

| Store | Key | Contents |
|---|---|---|
| `words` | `id` | Cards. Canonical write shape adds `deckId` and `meanings[]` (with `meaning` = `meanings[0]`), plus optional `contentLanguage` / `meaningLanguage` (per-card override). |
| `reviews` | `id` | Review events (`wordId`, grade, times). Unchanged. |
| `meta` | `key` | `lastBackup`, and **library records**: `folder:<id>` → `{type:'folder', id, name, createdAt, updatedAt}` and `deck:<id>` → `{type:'deck', id, folderId, name, contentLanguage, meaningLanguage, createdAt, updatedAt}`. |

Why `meta` and not new object stores: adding stores needs an IndexedDB version bump, and an older app build (`VERSION=1`) **cannot open** a database once it has been upgraded. Keeping version 1 means a Staging rollback never locks a user out of their cards. If indexes are ever needed, a later batch can move these records to dedicated stores with a tested upgrade.

## Default folder and deck
- Fixed ids: folder `00000000-0000-4000-8000-00000000f001` («غير مصنفة»), deck `00000000-0000-4000-8000-00000000d001` («بطاقاتي», `en-US` content, `ar-SA` meaning). The UI may localise these names by id.
- Created on first use (idempotent, inside one transaction). They cannot be deleted.
- A card with no `deckId` (saved before #15) **or** with a `deckId` that no longer exists is treated as belonging to the default deck. Reading never rewrites a card; a card gets `deckId` stored only when it is next written (review, archive, move).

## Meanings (#26, data part)
- A card has `meanings: string[]` (1–10, each 1–240 characters): **one card, one FSRS schedule**, however many meanings.
- `meaning` is still stored and always equals `meanings[0]`, so older builds (which read only `meaning`) keep working after a rollback, and v1/v2-era validation still holds.
- A card saved before #26 has only `meaning`; it is read as `meanings: [meaning]`, byte-for-byte (surrounding spaces included). Reading never rewrites it.
- New and edited meanings are trimmed, empty boxes dropped and exact repeats (case-insensitive) removed; at least one must remain.
- `editWord()` changes content only (term, meanings, example, translation, note, tag). It never touches `id`, `deckId`, `contentType`, `createdAt`, `dueAt`, `fsrsState`, `revision`, archive state or reviews.

## Languages
- BCP-47 tags, canonicalised with `Intl.getCanonicalLocales` (`en-us` → `en-US`). Invalid tags are refused.
- Effective language of a card: card override → deck → defaults (`cardLanguages()`). Never inferred from the text and independent of the AR/EN interface language (#19).

## Safety rules
- Duplicate names: folders are unique (case/space-insensitive); decks are unique within their folder.
- **No cascading delete.** A deck with any card (archived included) and a folder with any deck cannot be deleted; move them first. The defaults can never be deleted.
- Moving a card or a deck, renaming, or changing a deck's languages never touches `id`, `createdAt`, `dueAt`, `fsrsState`, `revision` or reviews.
- A review is written on top of the record read inside its own transaction, so a concurrent move is not undone.

## Backups
- Export: **v3** `{app:'wordloop', version:3, exportedAt, folders, decks, words, reviews}`.
- Import: v1, v2 and v3. v1/v2 cards go to the default deck with every other field unchanged. v3 is validated as a whole before anything is replaced: unique ids, every deck in a known folder, every card in a known deck, valid names and language tags, size limits. Missing defaults are added.
- Restore is one transaction over `words`, `reviews` and `meta`: either everything is replaced or nothing is. Other meta (`lastBackup`) is kept.

## Rollback and recovery
| Situation | Effect | Recovery |
|---|---|---|
| Staging rolled back to a pre-#15 build | Opens the same database (still version 1). Cards, reviews and FSRS are intact. Folder/deck records are ignored; `deckId` stays on cards because old code spreads the stored record on review/archive. | Roll forward: assignments are still there. |
| Old build restores an old v2 file | Cards and reviews are replaced; old folder/deck records stay in `meta` (empty, harmless). | Rename/delete the empty decks after roll forward. |
| Old build asked to import a **v3** file | Refused by the old version check ("unsupported format"); nothing is changed. | Import it after roll forward, or export a fresh file from the old build. |
| Cards created by an old build after rollback | No `deckId`. | Shown in the default deck after roll forward. |
