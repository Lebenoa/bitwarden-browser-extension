// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { Injectable } from "@angular/core";

import { FieldType, SecureNoteType, CipherType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { FieldView } from "@bitwarden/common/vault/models/view/field.view";
import { LoginUriView } from "@bitwarden/common/vault/models/view/login-uri.view";
import { LoginView } from "@bitwarden/common/vault/models/view/login.view";
import { SecureNoteView } from "@bitwarden/common/vault/models/view/secure-note.view";

/**
 * Line stored in the cipher's notes that marks a Secure Note as an API Key item.
 * Must appear on its own line. Users can see and remove it in any client;
 * removal makes the item fall back to an ordinary Secure Note presentation.
 */
export const API_KEY_MARKER_LINE = "bitwarden-api-key:v1";

/** Canonical hidden-field label used for the secret. */
export const API_KEY_FIELD_NAME = "Key";

/**
 * Identifies API Key items and builds their Secure Note representation.
 *
 * API Keys are ordinary Secure Notes (`CipherType.SecureNote`, `SecureNoteType.Generic`)
 * with exactly one hidden custom field named "Key" plus the marker line in `notes`.
 * The wire format is identical to a hand-made Secure Note, so official clients and
 * Vaultwarden need no changes. Identification is presentation-only and computed from
 * the decrypted `CipherView`; it is never persisted anywhere else.
 */
@Injectable({ providedIn: "root" })
export class ApiKeyService {
  /**
   * Returns true when the given cipher should be presented as an API Key.
   * A missing/damaged marker or a missing "Key" hidden field makes this false,
   * and the item remains accessible as an ordinary Secure Note.
   */
  isApiKey(cipher: CipherView | null | undefined): boolean {
    if (
      cipher == null ||
      cipher.type !== CipherType.SecureNote ||
      this.getKeyField(cipher) == null
    ) {
      return false;
    }
    return this.hasMarker(cipher.notes);
  }

  /** Returns the hidden "Key" field of an API Key cipher, or null. */
  getKeyField(cipher: CipherView | null | undefined): FieldView | null {
    if (cipher == null || cipher.type !== CipherType.SecureNote || !cipher.fields) {
      return null;
    }
    const keyFields = cipher.fields.filter(
      (f) =>
        f.type === FieldType.Hidden &&
        f.name?.trim().toLowerCase() === API_KEY_FIELD_NAME.toLowerCase(),
    );
    return keyFields.length === 1 ? keyFields[0] : null;
  }

  /** Returns the service dashboard URI if one is set (uses the standard login URI slot). */
  getUri(cipher: CipherView | null | undefined): string | null {
    const uri = cipher?.login?.uris?.[0]?.uri;
    return uri ?? null;
  }

  /** Returns notes text with the marker line removed, for display. */
  displayNotes(cipher: CipherView | null | undefined): string | null {
    if (!cipher?.notes) {
      return null;
    }
    return this.stripMarker(cipher.notes);
  }

  /**
   * Builds a decrypted CipherView for a new API Key, ready for the existing
   * encryption + `CipherService.createWithServer` path.
   */
  newCipherView(params: {
    name: string;
    key: string;
    uri?: string | null;
    notes?: string | null;
    folderId?: string | null;
  }): CipherView {
    const view = new CipherView();
    view.type = CipherType.SecureNote;
    view.name = params.name;
    view.secureNote.type = SecureNoteType.Generic;
    view.notes = this.withMarker(params.notes);
    view.fields = [this.buildKeyField(params.key)];
    if (params.folderId != null) {
      view.folderId = params.folderId;
    }
    if (params.uri) {
      const login = new LoginView();
      login.uris = [Object.assign(new LoginUriView(), { uri: params.uri })];
      view.login = login;
    }
    return view;
  }

  /**
   * Applies edited values onto an existing API Key CipherView, preserving the marker
   * and the hidden field type so classification and cross-client compatibility hold.
   */
  applyEdit(
    cipher: CipherView,
    params: {
      name: string;
      key?: string | null;
      uri?: string | null;
      notes?: string | null;
      folderId?: string | null;
    },
  ): CipherView {
    cipher.type = CipherType.SecureNote;
    cipher.name = params.name;
    if (cipher.secureNote == null) {
      cipher.secureNote = new SecureNoteView();
    }
    cipher.secureNote.type = SecureNoteType.Generic;
    cipher.notes = this.withMarker(params.notes);

    const existing = this.getKeyField(cipher);
    if (existing != null) {
      existing.type = FieldType.Hidden;
      existing.name = API_KEY_FIELD_NAME;
      if (params.key != null) {
        existing.value = params.key;
      }
    } else {
      cipher.fields = [...(cipher.fields ?? []), this.buildKeyField(params.key ?? "")];
    }

    cipher.folderId = params.folderId ?? cipher.folderId;
    if (params.uri) {
      if (cipher.login?.uris?.length) {
        cipher.login.uris[0].uri = params.uri;
      } else {
        const login = new LoginView();
        login.uris = [Object.assign(new LoginUriView(), { uri: params.uri })];
        cipher.login = login;
      }
    } else {
      // Explicitly clearing the URI removes the login container entirely so the
      // item does not advertise autofill behavior it cannot support.
      cipher.login = null;
    }
    return cipher;
  }

  /** True when notes contain the marker on its own line (case-sensitive). */
  private hasMarker(notes: string | null | undefined): boolean {
    if (!notes) {
      return false;
    }
    return notes.split(/\r?\n/).some((line) => line.trim() === API_KEY_MARKER_LINE);
  }

  private stripMarker(notes: string): string {
    return notes
      .split(/\r?\n/)
      .filter((line) => line.trim() !== API_KEY_MARKER_LINE)
      .join("\n")
      .replace(/^\s+/, "")
      .replace(/\s+$/, "");
  }

  private withMarker(notes: string | null | undefined): string {
    const body = this.stripMarker(notes ?? "");
    return body ? `${body}\n${API_KEY_MARKER_LINE}` : API_KEY_MARKER_LINE;
  }

  private buildKeyField(value: string): FieldView {
    const field = new FieldView();
    field.type = FieldType.Hidden;
    field.name = API_KEY_FIELD_NAME;
    field.value = value;
    return field;
  }
}
