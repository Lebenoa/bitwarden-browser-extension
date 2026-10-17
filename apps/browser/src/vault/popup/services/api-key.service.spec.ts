import { CipherType, FieldType, SecureNoteType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { FieldView } from "@bitwarden/common/vault/models/view/field.view";

import { API_KEY_FIELD_NAME, API_KEY_MARKER_LINE, ApiKeyService } from "./api-key.service";

/** Synthetic test key — never a real credential. */
const TEST_KEY = "test-synthetic-key-1234567890abcdef";

function keyField(value: string = TEST_KEY, type: FieldType = FieldType.Hidden): FieldView {
  const field = new FieldView();
  field.type = type;
  field.name = API_KEY_FIELD_NAME;
  field.value = value;
  return field;
}

function secureNote(
  fields: FieldView[] = [keyField()],
  notes: string | null = API_KEY_MARKER_LINE,
): CipherView {
  const view = new CipherView();
  view.type = CipherType.SecureNote;
  view.name = "Cloudflare API Token";
  view.secureNote.type = SecureNoteType.Generic;
  view.fields = fields;
  view.notes = notes;
  return view;
}

describe("ApiKeyService", () => {
  const service = new ApiKeyService();

  describe("isApiKey", () => {
    it("identifies a correctly shaped API Key", () => {
      expect(service.isApiKey(secureNote())).toBe(true);
    });

    it("identifies API Key with marker among other notes", () => {
      expect(
        service.isApiKey(secureNote([keyField()], `Some note\n${API_KEY_MARKER_LINE}\nmore`)),
      ).toBe(true);
    });

    it("rejects a Login cipher", () => {
      const login = new CipherView();
      login.type = CipherType.Login;
      login.fields = [keyField()];
      login.notes = API_KEY_MARKER_LINE;
      expect(service.isApiKey(login)).toBe(false);
    });

    it("rejects a Secure Note without the hidden Key field", () => {
      expect(service.isApiKey(secureNote([], API_KEY_MARKER_LINE))).toBe(false);
    });

    it("rejects a Key field of Text type (wrong field type)", () => {
      expect(service.isApiKey(secureNote([keyField(TEST_KEY, FieldType.Text)]))).toBe(false);
    });

    it("rejects a Key field with a different name", () => {
      const other = keyField();
      other.name = "Token";
      expect(service.isApiKey(secureNote([other]))).toBe(false);
    });

    it("rejects missing marker", () => {
      expect(service.isApiKey(secureNote([keyField()], null))).toBe(false);
      expect(service.isApiKey(secureNote([keyField()], "just a note"))).toBe(false);
    });

    it("rejects a damaged marker (not on its own line)", () => {
      expect(service.isApiKey(secureNote([keyField()], `inline ${API_KEY_MARKER_LINE} text`))).toBe(
        false,
      );
    });

    it("rejects multiple Key fields (ambiguous)", () => {
      expect(service.isApiKey(secureNote([keyField(), keyField("second")]))).toBe(false);
    });

    it("does not misclassify an ordinary Secure Note with a hidden Key field but no marker", () => {
      const ordinary = secureNote([keyField()], "User made this by hand");
      expect(service.isApiKey(ordinary)).toBe(false);
    });

    it("handles null and undefined ciphers", () => {
      expect(service.isApiKey(null)).toBe(false);
      expect(service.isApiKey(undefined)).toBe(false);
    });
  });

  describe("getKeyField", () => {
    it("returns the single hidden Key field", () => {
      const cipher = secureNote();
      expect(service.getKeyField(cipher)?.value).toBe(TEST_KEY);
    });

    it("is case-insensitive and trims the field name", () => {
      const cipher = secureNote();
      cipher.fields![0].name = "  key ";
      expect(service.getKeyField(cipher)).toBe(cipher.fields![0]);
    });

    it("returns null when no single Key field exists", () => {
      expect(service.getKeyField(secureNote([]))).toBeNull();
    });
  });

  describe("newCipherView", () => {
    it("builds a Secure Note with hidden Key field and marker", () => {
      const view = service.newCipherView({ name: "Cloudflare", key: TEST_KEY });
      expect(view.type).toBe(CipherType.SecureNote);
      expect(view.secureNote.type).toBe(SecureNoteType.Generic);
      expect(view.name).toBe("Cloudflare");
      expect(view.fields).toHaveLength(1);
      expect(view.fields![0].type).toBe(FieldType.Hidden);
      expect(view.fields![0].name).toBe(API_KEY_FIELD_NAME);
      expect(view.fields![0].value).toBe(TEST_KEY);
      expect(view.notes).toBe(API_KEY_MARKER_LINE);
      expect(service.isApiKey(view)).toBe(true);
    });

    it("keeps user notes and appends the marker", () => {
      const view = service.newCipherView({ name: "x", key: TEST_KEY, notes: "hello" });
      expect(view.notes).toBe(`hello\n${API_KEY_MARKER_LINE}`);
    });

    it("sets folder and optional dashboard URI", () => {
      const view = service.newCipherView({
        name: "x",
        key: TEST_KEY,
        folderId: "folder-1",
        uri: "https://dash.example.com/api",
      });
      expect(view.folderId).toBe("folder-1");
      expect(view.login!.uris[0].uri).toBe("https://dash.example.com/api");
    });
  });

  describe("applyEdit", () => {
    it("preserves classification when renaming", () => {
      const view = service.newCipherView({ name: "Old", key: TEST_KEY });
      service.applyEdit(view, { name: "Renamed", key: null });
      expect(view.name).toBe("Renamed");
      expect(service.isApiKey(view)).toBe(true);
    });

    it("replaces the secret value but keeps hidden type and field name", () => {
      const view = service.newCipherView({ name: "x", key: TEST_KEY });
      service.applyEdit(view, { name: "x", key: "new-synthetic-value" });
      expect(view.fields![0].value).toBe("new-synthetic-value");
      expect(view.fields![0].type).toBe(FieldType.Hidden);
      expect(view.fields![0].name).toBe(API_KEY_FIELD_NAME);
      expect(service.isApiKey(view)).toBe(true);
    });

    it("preserves marker when notes are edited", () => {
      const view = service.newCipherView({ name: "x", key: TEST_KEY, notes: "original" });
      service.applyEdit(view, { name: "x", notes: "changed" });
      expect(view.notes).toBe(`changed\n${API_KEY_MARKER_LINE}`);
      expect(service.isApiKey(view)).toBe(true);
    });

    it("round-trips notes without duplicating the marker", () => {
      const view = service.newCipherView({ name: "x", key: TEST_KEY });
      const once = service.displayNotes(view);
      service.applyEdit(view, { name: "x", notes: once });
      expect(view.notes).toBe(API_KEY_MARKER_LINE);
    });

    it("updates an existing URI in place", () => {
      const view = service.newCipherView({
        name: "x",
        key: TEST_KEY,
        uri: "https://a.example.com",
      });
      service.applyEdit(view, { name: "x", uri: "https://b.example.com" });
      expect(view.login!.uris).toHaveLength(1);
      expect(view.login!.uris[0].uri).toBe("https://b.example.com");
    });

    it("clears the URI when emptied", () => {
      const view = service.newCipherView({
        name: "x",
        key: TEST_KEY,
        uri: "https://a.example.com",
      });
      service.applyEdit(view, { name: "x", uri: null });
      expect(view.login).toBeNull();
    });
  });

  describe("displayNotes", () => {
    it("strips the marker for display", () => {
      const view = secureNote([keyField()], `visible notes\n${API_KEY_MARKER_LINE}`);
      expect(service.displayNotes(view)).toBe("visible notes");
    });

    it("returns null when notes are empty", () => {
      const view = secureNote([keyField()], null);
      expect(service.displayNotes(view)).toBeNull();
    });
  });

  describe("compatibility round-trip (handmade in another client)", () => {
    it("identifies a Secure Note hand-built exactly like an official client would produce", () => {
      // Fields as an unmodified client stores them after editing the item.
      const handmade = secureNote();
      handmade.fields = [];
      const stored = keyField(TEST_KEY);
      stored.newField = false;
      stored.showValue = false;
      handmade.fields = [stored];
      expect(service.isApiKey(handmade)).toBe(true);
    });
  });
});
