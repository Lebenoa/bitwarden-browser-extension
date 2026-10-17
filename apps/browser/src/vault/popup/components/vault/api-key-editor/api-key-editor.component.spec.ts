import { ComponentFixture, fakeAsync, flush, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { mock, MockProxy } from "jest-mock-extended";
import { BehaviorSubject, of } from "rxjs";

import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { FolderService } from "@bitwarden/common/vault/abstractions/folder/folder.service.abstraction";
import { CipherType, FieldType, SecureNoteType } from "@bitwarden/common/vault/enums";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { FieldView } from "@bitwarden/common/vault/models/view/field.view";
import { DialogService, ToastService } from "@bitwarden/components";

import { PopupRouterCacheService } from "../../../../../platform/popup/view-cache/popup-router-cache.service";
import { ApiKeyService } from "../../../services/api-key.service";

import { ApiKeyEditorComponent } from "./api-key-editor.component";

/** Synthetic test key — never a real credential. */
const TEST_KEY = "test-synthetic-key-abcdef1234567890";

function buildApiKeyView(): CipherView {
  const view = new CipherView();
  view.id = "cipher-1" as CipherView["id"];
  view.type = CipherType.SecureNote;
  view.name = "Cloudflare API Token";
  view.secureNote.type = SecureNoteType.Generic;
  view.notes = `user notes\nbitwarden-api-key:v1`;
  const field = new FieldView();
  field.type = FieldType.Hidden;
  field.name = "Key";
  field.value = TEST_KEY;
  view.fields = [field];
  view.edit = true;
  return view;
}

describe("ApiKeyEditorComponent", () => {
  let fixture: ComponentFixture<ApiKeyEditorComponent>;
  let component: ApiKeyEditorComponent;
  let queryParams$: BehaviorSubject<Record<string, string>>;
  let cipherService: MockProxy<CipherService>;
  let router: MockProxy<Router>;
  let platformUtils: MockProxy<PlatformUtilsService>;
  let toastService: { showToast: jest.Mock };

  const i18n = {
    t: (key: string, ...rest: unknown[]) => (rest.length ? `${key} ${rest.join(" ")}` : key),
  };
  const accountService = { activeAccount$: of({ id: "user-1" as never }) };

  beforeEach(async () => {
    queryParams$ = new BehaviorSubject({});
    cipherService = mock<CipherService>();
    router = mock<Router>();
    platformUtils = mock<PlatformUtilsService>();
    toastService = { showToast: jest.fn() };
    cipherService.cipherViews$.mockReturnValue(of([buildApiKeyView()]));

    await TestBed.configureTestingModule({
      imports: [ApiKeyEditorComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { queryParams: queryParams$ } },
        {
          provide: Router,
          useValue: {
            navigate: router.navigate,
            url: "/new-api-key",
            events: of(),
          },
        },
        { provide: PopupRouterCacheService, useValue: { back: jest.fn(), setHistory: jest.fn() } },
        { provide: CipherService, useValue: cipherService },
        { provide: PlatformUtilsService, useValue: platformUtils },
        { provide: ToastService, useValue: toastService },
        { provide: I18nService, useValue: i18n },
        { provide: AccountService, useValue: accountService },
        { provide: LogService, useValue: mock<LogService>() },
        { provide: FolderService, useValue: mock<FolderService>() },
        { provide: DialogService, useValue: mock<DialogService>() },
        { provide: ApiKeyService, useValue: new ApiKeyService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ApiKeyEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("opens in add mode when no cipherId is provided", async () => {
    queryParams$.next({});
    await fixture.whenStable();
    expect(component["mode"]()).toBe("add");
    expect(component["headerText"]()).toBe("addItemHeaderApiKey");
  });

  it("loads an existing API Key in view mode and falls back for unclassified items", fakeAsync(() => {
    queryParams$.next({ cipherId: "cipher-1" });
    flush();
    expect(component["mode"]()).toBe("view");

    // Unclassified item (no marker) redirects to the generic view.
    const plain = buildApiKeyView();
    plain.notes = "no marker";
    cipherService.cipherViews$.mockReturnValue(of([plain]));
    router.navigate.mockClear();
    queryParams$.next({ cipherId: "cipher-1" });
    flush();
    expect(router.navigate).toHaveBeenCalledWith(
      ["/view-cipher"],
      expect.objectContaining({ queryParams: { cipherId: "cipher-1" } }),
    );
  }));

  it("creates via cipherService.createWithServer with Secure Note shape on save", async () => {
    queryParams$.next({});
    await fixture.whenStable();
    component["form"].setValue({
      name: "Cloudflare",
      key: TEST_KEY,
      uri: "",
      notes: "",
      folderId: null,
    });
    cipherService.createWithServer.mockResolvedValue({ id: "new-1" } as CipherView);
    router.navigate.mockResolvedValue(true);

    await component["save"]();

    expect(cipherService.createWithServer).toHaveBeenCalledTimes(1);
    const savedView = cipherService.createWithServer.mock.calls[0][0] as CipherView;
    expect(savedView.type).toBe(CipherType.SecureNote);
    expect(savedView.secureNote.type).toBe(SecureNoteType.Generic);
    expect(savedView.fields).toHaveLength(1);
    expect(savedView.fields![0].type).toBe(FieldType.Hidden);
    expect(savedView.fields![0].name).toBe("Key");
    expect(savedView.fields![0].value).toBe(TEST_KEY);
    expect(savedView.notes).toContain("bitwarden-api-key:v1");
  });

  it("updates via cipherService.updateWithServer preserving hidden field in edit mode", async () => {
    queryParams$.next({ cipherId: "cipher-1", edit: "true" });
    await fixture.whenStable();
    expect(component["mode"]()).toBe("edit");

    component["form"].patchValue({ name: "Renamed", key: "rotated-synthetic-key" });
    cipherService.updateWithServer.mockResolvedValue({ id: "cipher-1" } as CipherView);
    router.navigate.mockResolvedValue(true);

    await component["save"]();

    expect(cipherService.updateWithServer).toHaveBeenCalledTimes(1);
    const updatedView = cipherService.updateWithServer.mock.calls[0][0] as CipherView;
    expect(updatedView.type).toBe(CipherType.SecureNote);
    expect(updatedView.name).toBe("Renamed");
    expect(updatedView.fields![0].type).toBe(FieldType.Hidden);
    expect(updatedView.fields![0].value).toBe("rotated-synthetic-key");
    expect(updatedView.notes).toContain("bitwarden-api-key:v1");
  });

  it("copies the secret through the platform clipboard service", async () => {
    queryParams$.next({ cipherId: "cipher-1" });
    await fixture.whenStable();

    await component["copySecret"]();

    expect(platformUtils.copyToClipboard).toHaveBeenCalledWith(TEST_KEY);
  });

  it("reveals the secret only after toggling", async () => {
    queryParams$.next({ cipherId: "cipher-1" });
    await fixture.whenStable();
    expect(component["revealSecret"]()).toBe(false);
    component["toggleReveal"]();
    expect(component["revealSecret"]()).toBe(true);
  });

  it("does not save when the form is invalid (missing name or key)", async () => {
    queryParams$.next({});
    await fixture.whenStable();
    component["form"].setValue({ name: "", key: "", uri: "", notes: "", folderId: null });

    await component["save"]();

    expect(cipherService.createWithServer).not.toHaveBeenCalled();
  });
});
