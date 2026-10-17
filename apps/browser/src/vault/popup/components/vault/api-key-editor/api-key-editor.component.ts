// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { CommonModule } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { toSignal, takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom, switchMap } from "rxjs";
import { map } from "rxjs/operators";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { UserId } from "@bitwarden/common/types/guid";
import { CipherService } from "@bitwarden/common/vault/abstractions/cipher.service";
import { FolderService } from "@bitwarden/common/vault/abstractions/folder/folder.service.abstraction";
import { CipherView } from "@bitwarden/common/vault/models/view/cipher.view";
import { FolderView } from "@bitwarden/common/vault/models/view/folder.view";
import {
  AutofocusDirective,
  ButtonModule,
  CardComponent,
  DialogService,
  FormFieldModule,
  IconButtonModule,
  InputModule,
  ItemModule,
  SelectModule,
  SectionComponent,
  SectionHeaderComponent,
  ToastService,
  TypographyModule,
} from "@bitwarden/components";

import { PopupFooterComponent } from "../../../../../platform/popup/layout/popup-footer.component";
import { PopupHeaderComponent } from "../../../../../platform/popup/layout/popup-header.component";
import { PopupPageComponent } from "../../../../../platform/popup/layout/popup-page.component";
import { ApiKeyService } from "../../../services/api-key.service";

/**
 * Dedicated create / view / edit experience for API Key items.
 *
 * API Keys are Secure Notes with a hidden "Key" custom field and a notes marker
 * (see {@link ApiKeyService}). This component only manipulates the decrypted
 * CipherView and delegates all persistence to the standard CipherService paths;
 * no encryption, transport, or storage logic is duplicated here.
 *
 * The secret is rendered only through a password-type input with a reveal toggle.
 * It is never included in logs, toasts, or error messages.
 */
@Component({
  selector: "app-api-key-editor",
  templateUrl: "api-key-editor.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    JslibModule,
    ReactiveFormsModule,
    PopupPageComponent,
    PopupHeaderComponent,
    PopupFooterComponent,
    AutofocusDirective,
    ButtonModule,
    CardComponent,
    FormFieldModule,
    IconButtonModule,
    InputModule,
    ItemModule,
    SelectModule,
    SectionComponent,
    SectionHeaderComponent,
    TypographyModule,
  ],
})
export class ApiKeyEditorComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly i18nService = inject(I18nService);
  private readonly logService = inject(LogService);
  private readonly toastService = inject(ToastService);
  private readonly dialogService = inject(DialogService);
  private readonly platformUtilsService = inject(PlatformUtilsService);
  private readonly cipherService = inject(CipherService);
  private readonly folderService = inject(FolderService);
  private readonly accountService = inject(AccountService);
  private readonly apiKeyService = inject(ApiKeyService);

  readonly formId = "apiKeyEditorForm";

  /** View mode: add (new), view (read-only), or edit (existing cipher). */
  protected readonly mode = signal<"add" | "view" | "edit">("add");

  protected readonly revealSecret = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);

  protected readonly folders = toSignal(
    this.accountService.activeAccount$.pipe(
      getUserId,
      switchMap((userId) => this.folderService.folderViews$(userId)),
    ),
    { initialValue: [] as FolderView[] },
  );

  protected readonly headerText = signal("");
  protected readonly cipherView = signal<CipherView | null>(null);
  private readonly activeUserId = signal<UserId | null>(null);

  protected readonly form = this.formBuilder.group({
    name: ["", [Validators.required]],
    key: ["", [Validators.required]],
    uri: [""],
    notes: [""],
    folderId: [null as string | null],
  });

  constructor() {
    this.route.queryParams
      .pipe(
        switchMap(async (params) => {
          this.activeUserId.set(
            await firstValueFrom(this.accountService.activeAccount$.pipe(getUserId)),
          );

          if (params.cipherId == null) {
            this.mode.set("add");
            this.cipherView.set(null);
            this.headerText.set(this.i18nService.t("addItemHeaderApiKey"));
            this.form.controls.folderId.setValue(params.folderId ?? null);
            this.loading.set(false);
            return;
          }

          const cipher = await firstValueFrom(
            this.cipherService
              .cipherViews$(this.activeUserId()!)
              .pipe(map((ciphers) => ciphers.find((c) => c.id === params.cipherId))),
          );
          if (cipher == null) {
            void this.router.navigate(["/vault"]);
            return;
          }

          // Not classified as API Key (marker removed, field renamed, etc.) — fall
          // back to the generic Secure Note view/edit flow without rewriting data.
          if (!this.apiKeyService.isApiKey(cipher)) {
            void this.router.navigate(["/view-cipher"], {
              queryParams: { cipherId: params.cipherId },
            });
            return;
          }

          this.cipherView.set(cipher);
          if (params.edit === "true") {
            this.mode.set("edit");
            this.headerText.set(this.i18nService.t("editItemHeaderApiKey"));
          } else {
            this.mode.set("view");
            this.headerText.set(this.i18nService.t("viewItemHeaderApiKey"));
          }

          this.form.patchValue({
            name: cipher.name ?? "",
            key: this.apiKeyService.getKeyField(cipher)?.value ?? "",
            uri: this.apiKeyService.getUri(cipher) ?? "",
            notes: this.apiKeyService.displayNotes(cipher) ?? "",
            folderId: cipher.folderId ?? null,
          });
          this.loading.set(false);
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  protected toggleReveal() {
    this.revealSecret.update((v) => !v);
  }

  protected async copySecret() {
    const cipher = this.cipherView();
    if (cipher == null) {
      return;
    }
    const value = this.apiKeyService.getKeyField(cipher)?.value;
    if (value == null) {
      return;
    }
    // Standard clipboard mechanism; the value never appears in UI text or logs.
    this.platformUtilsService.copyToClipboard(value);
    this.toastService.showToast({
      variant: "success",
      title: null,
      message: this.i18nService.t("valueCopied", this.i18nService.t("apiKeySecret")),
    });
  }

  protected async edit() {
    await this.router.navigate([], {
      queryParams: { cipherId: this.cipherView()?.id, edit: "true" },
      queryParamsHandling: "merge",
    });
  }

  protected async save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.value as {
      name: string;
      key: string;
      uri: string;
      notes: string;
      folderId: string | null;
    };

    this.saving.set(true);
    try {
      if (this.mode() === "add") {
        const newView = this.apiKeyService.newCipherView({
          name: value.name,
          key: value.key,
          uri: value.uri || null,
          notes: value.notes || null,
          folderId: value.folderId,
        });
        const saved = await this.cipherService.createWithServer(newView, this.activeUserId()!);
        this.toastService.showToast({
          variant: "success",
          title: null,
          message: this.i18nService.t("addedItem"),
        });
        await this.router.navigate(["/view-cipher"], {
          replaceUrl: true,
          queryParams: { cipherId: saved.id },
        });
        return;
      }

      const originalView = this.cipherView();
      if (originalView == null) {
        return;
      }
      const updated = this.apiKeyService.applyEdit(originalView, {
        name: value.name,
        key: value.key || null,
        uri: value.uri || null,
        notes: value.notes || null,
        folderId: value.folderId,
      });
      await this.cipherService.updateWithServer(updated, this.activeUserId()!, originalView);
      this.toastService.showToast({
        variant: "success",
        title: null,
        message: this.i18nService.t("editedItem"),
      });
      await this.router.navigate(["/view-cipher"], {
        replaceUrl: true,
        queryParams: { cipherId: updated.id },
      });
    } catch (e) {
      // Error content never includes the secret value.
      this.logService.error("Failed to save API Key item", e);
      this.toastService.showToast({
        variant: "error",
        title: null,
        message: this.i18nService.t("errorOccurred"),
      });
    } finally {
      this.saving.set(false);
    }
  }

  protected async delete() {
    const cipher = this.cipherView();
    if (cipher == null || this.activeUserId() == null) {
      return;
    }
    const confirmed = await this.dialogService.openSimpleDialog({
      title: { key: "deleteItem" },
      content: { key: "deleteItemConfirmation" },
      type: "warning",
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.cipherService.softDeleteWithServer(cipher.id!, this.activeUserId()!);
      this.toastService.showToast({
        variant: "success",
        title: null,
        message: this.i18nService.t("deletedItem"),
      });
      await this.router.navigate(["/vault"], { replaceUrl: true });
    } catch (e) {
      this.logService.error("Failed to delete API Key item", e);
    }
  }

  protected async cancel() {
    if (this.mode() === "edit") {
      await this.router.navigate(["/view-cipher"], {
        replaceUrl: true,
        queryParams: { cipherId: this.cipherView()?.id },
      });
      return;
    }
    await this.router.navigate(["/vault"], { replaceUrl: true });
  }
}
