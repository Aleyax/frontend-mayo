import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Category } from '../../../category/interfaces/category.interface';
import { Color } from '../../../color/interfaces/color.interface';
import { Size } from '../../../size/interfaces/size.interface';
import {
  Product,
  ProductCreateRequest,
  ProductVariantMode,
  ProductUpdateRequest,
  ProductVariant
} from '../../../product/interfaces/product.interface';
import { ProductService } from '../../../product/services/product.service';

interface ProductVariantForm extends Omit<ProductVariant, 'id' | 'sku'> {
  id?: number;
  sku?: string;
  imageFile?: File;
  imagePreview?: string;
}

@Component({
  selector: 'app-product-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './product-modal.component.html',
  styleUrls: ['./product-modal.component.css']
})
export class ProductModalComponent implements OnInit, AfterViewInit {
  @Input() categories: Category[] = [];
  @Input() colors: Color[] = [];
  @Input() sizes: Size[] = [];
  @Output() productSaved = new EventEmitter<{
    mode: 'create' | 'edit';
    id?: number;
    payload: ProductCreateRequest | ProductUpdateRequest;
  }>();

  productForm!: FormGroup;
  submitted = false;
  editingProduct = signal<Product | null>(null);
  variants = signal<ProductVariantForm[]>([]);
  productImages = signal<Array<{ file?: File; preview: string; url?: string; publicId?: string }>>([]);
  variantMode = signal<ProductVariantMode>('MATRIX');
  selectedColorIds = signal<number[]>([]);
  selectedSizeIds = signal<number[]>([]);
  deletingImageIndex = signal<number | null>(null);
  formError = signal<string>('');
  formMessage = signal<string>('');
  variantsDirty = signal(false);
  imagesDirty = signal(false);
  @ViewChild('descriptionEditor') descriptionEditor?: ElementRef<HTMLDivElement>;

  private productService = inject(ProductService);

  ngOnInit() {
    this.initializeForm();
  }

  ngAfterViewInit() {
    this.syncDescriptionEditorWithForm();
  }

  initializeForm() {
    this.productForm = new FormBuilder().group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      categoryId: [null, Validators.required],
      isActive: [true],
    });
  }

  setEditingProduct(product: Product | null) {
    this.submitted = false;
    this.formError.set('');
    this.formMessage.set('');
    this.variants.set([]);
    this.productImages.set([]);
    this.variantMode.set('MATRIX');
    this.selectedColorIds.set([]);
    this.selectedSizeIds.set([]);
    this.variantsDirty.set(false);
    this.imagesDirty.set(false);
    this.editingProduct.set(product);

    if (product) {
      const productVariants = product.variants || [];
      const isSimpleProduct =
        product.variantMode === 'SIMPLE' ||
        (productVariants.length === 1 && !!productVariants[0]?.isSimpleVariant);
      const isSizeOnlyProduct =
        product.variantMode === 'SIZE_ONLY' ||
        (!!productVariants.length && productVariants.every((variant) => !!variant.isSizeOnlyVariant));

      this.variantMode.set(isSimpleProduct ? 'SIMPLE' : (isSizeOnlyProduct ? 'SIZE_ONLY' : 'MATRIX'));

      if (isSimpleProduct) {
        const firstVariant = productVariants[0];
        this.selectedColorIds.set([]);
        this.selectedSizeIds.set([]);
        this.variants.set(firstVariant ? [{
          id: firstVariant.id,
          sku: firstVariant.sku,
          colorId: firstVariant.colorId || 0,
          sizeId: firstVariant.sizeId || 0,
          price: Number(firstVariant.price),
          isActive: firstVariant.isActive !== false,
          imageUrl: firstVariant.imageUrl || undefined,
          imagePreview: firstVariant.imageUrl || undefined,
        }] : [{
          colorId: 0,
          sizeId: 0,
          price: 0,
          isActive: true,
        }]);
      } else if (isSizeOnlyProduct) {
        const productSizeIds = productVariants.map((variant) => variant.sizeId).filter((id) => id > 0);
        this.selectedColorIds.set([]);
        this.selectedSizeIds.set([...new Set(productSizeIds)]);
        this.variants.set(
          productVariants.map((variant) => ({
            id: variant.id,
            sku: variant.sku,
            colorId: variant.colorId || 0,
            sizeId: variant.sizeId,
            price: Number(variant.price),
            isActive: variant.isActive !== false,
            imageUrl: variant.imageUrl || undefined,
            imagePreview: variant.imageUrl || undefined,
          })),
        );
      } else {
        const productVariantIds = productVariants.map((variant) => variant.colorId);
        const productSizeIds = productVariants.map((variant) => variant.sizeId);

        this.selectedColorIds.set([...new Set(productVariantIds)]);
        this.selectedSizeIds.set([...new Set(productSizeIds)]);
        this.variants.set(
          productVariants.map((variant) => ({
            id: variant.id,
            sku: variant.sku,
            colorId: variant.colorId,
            sizeId: variant.sizeId,
            price: Number(variant.price),
            isActive: variant.isActive !== false,
            imageUrl: variant.imageUrl || undefined,
            imagePreview: variant.imageUrl || undefined,
          })),
        );
      }
      this.productImages.set(
        (product.images || []).map((image) => {
          const publicId = this.extractPublicIdFromUrl(image.url);
          return {
            preview: image.url,
            url: image.url,
            publicId,
          };
        }),
      );

      this.productForm.patchValue({
        name: product.name,
        description: product.description || '',
        categoryId: product.categoryId,
        isActive: product.isActive,
      });
      this.syncDescriptionEditorWithForm();
      this.productForm.markAsPristine();
      this.productForm.markAsUntouched();
    } else {
      this.productForm.reset({
        name: '',
        description: '',
        categoryId: null,
        isActive: true,
      });
      this.variantMode.set('MATRIX');
      this.syncDescriptionEditorWithForm();
      this.productForm.markAsPristine();
      this.productForm.markAsUntouched();
    }
  }

  private looksLikeHtml(value: string): boolean {
    return /<\/?[a-z][\s\S]*>/i.test(value);
  }

  private sanitizeDescriptionHtml(html: string): string {
    const container = document.createElement('div');
    container.innerHTML = html;
    container.querySelectorAll('script,style').forEach((node) => node.remove());
    container.querySelectorAll('*').forEach((element) => {
      Array.from(element.attributes).forEach((attr) => {
        if (attr.name.toLowerCase().startsWith('on')) {
          element.removeAttribute(attr.name);
        }
      });
    });
    return container.innerHTML;
  }

  private syncDescriptionEditorWithForm() {
    const editor = this.descriptionEditor?.nativeElement;
    if (!editor) return;
    const value = String(this.productForm.get('description')?.value || '');
    if (!value) {
      editor.innerHTML = '';
      return;
    }
    if (this.looksLikeHtml(value)) {
      editor.innerHTML = value;
      return;
    }
    editor.textContent = value;
  }

  onDescriptionInput() {
    const editor = this.descriptionEditor?.nativeElement;
    const control = this.productForm.get('description');
    if (!editor || !control) return;
    const text = (editor.textContent || '').trim();
    const html = text ? this.sanitizeDescriptionHtml(editor.innerHTML) : '';
    control.setValue(html, { emitEvent: false });
    control.markAsDirty();
  }

  private focusDescriptionEditor() {
    this.descriptionEditor?.nativeElement.focus();
  }

  applyDescriptionCommand(command: string, value?: string) {
    this.focusDescriptionEditor();
    document.execCommand(command, false, value);
    this.onDescriptionInput();
  }

  setDescriptionBlock(tagName: 'p' | 'h2' | 'h3' | 'blockquote') {
    this.applyDescriptionCommand('formatBlock', tagName);
  }

  setDescriptionFont(fontName: string) {
    if (!fontName) return;
    this.applyDescriptionCommand('fontName', fontName);
  }

  setDescriptionColor(color: string) {
    if (!color) return;
    this.applyDescriptionCommand('foreColor', color);
  }

  setDescriptionFontSize(size: string) {
    if (!size) return;
    this.applyDescriptionCommand('fontSize', size);
  }

  insertDescriptionGrid() {
    const tableHtml = `
      <table style="width:100%; border-collapse: collapse; margin: 0.5rem 0;">
        <tbody>
          <tr>
            <td style="border:1px solid #94a3b8; padding:6px;">Celda 1</td>
            <td style="border:1px solid #94a3b8; padding:6px;">Celda 2</td>
          </tr>
          <tr>
            <td style="border:1px solid #94a3b8; padding:6px;">Celda 3</td>
            <td style="border:1px solid #94a3b8; padding:6px;">Celda 4</td>
          </tr>
        </tbody>
      </table>
    `;
    this.applyDescriptionCommand('insertHTML', tableHtml);
  }

  clearDescriptionFormat() {
    this.applyDescriptionCommand('removeFormat');
  }

  private extractPublicIdFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      const filenameWithExt = pathParts[pathParts.length - 1];
      const filename = filenameWithExt.split('?')[0];
      const publicId = filename.includes('.') ? filename.substring(0, filename.lastIndexOf('.')) : filename;
      const folder = pathParts[pathParts.length - 2];
      return `${folder}/${publicId}`;
    } catch {
      return url;
    }
  }

  get isEditing() {
    return this.editingProduct() !== null;
  }

  setVariantMode(mode: ProductVariantMode) {
    if (this.variantMode() === mode) {
      return;
    }

    this.variantMode.set(mode);
    this.variantsDirty.set(true);
    this.formError.set('');

    if (mode === 'SIMPLE') {
      const firstVariant = this.variants()[0];
      this.selectedColorIds.set([]);
      this.selectedSizeIds.set([]);
      this.variants.set([{
        colorId: firstVariant?.colorId ?? 0,
        sizeId: firstVariant?.sizeId ?? 0,
        price: Number(firstVariant?.price || 0),
        isActive: firstVariant?.isActive !== false,
        imageUrl: firstVariant?.imageUrl,
        imagePreview: firstVariant?.imagePreview || firstVariant?.imageUrl || undefined,
        imageFile: firstVariant?.imageFile,
      }]);
      return;
    }

    if (mode === 'SIZE_ONLY') {
      this.selectedColorIds.set([]);
      this.variants.set([]);
      return;
    }

    this.variants.set([]);
  }

  get isSimpleMode() {
    return this.variantMode() === 'SIMPLE';
  }

  get isSizeOnlyMode() {
    return this.variantMode() === 'SIZE_ONLY';
  }

  toggleColor(colorId: number, checked: boolean) {
    const current = this.selectedColorIds();
    this.variantsDirty.set(true);
    if (checked) {
      this.selectedColorIds.set([...current, colorId]);
    } else {
      this.selectedColorIds.set(current.filter((id) => id !== colorId));
    }
  }

  toggleSize(sizeId: number, checked: boolean) {
    const current = this.selectedSizeIds();
    this.variantsDirty.set(true);
    if (checked) {
      this.selectedSizeIds.set([...current, sizeId]);
    } else {
      this.selectedSizeIds.set(current.filter((id) => id !== sizeId));
    }
  }

  async generateVariants() {
    this.formError.set('');

    if (this.isSimpleMode) {
      this.formError.set('En modo producto unico no necesitas generar variantes.');
      return;
    }

    const sizes = this.selectedSizeIds();

    if (!sizes.length) {
      this.formError.set('Selecciona al menos una talla para generar variantes.');
      return;
    }

    const existingVariants = new Map(this.variants().map((variant) => ([`${variant.colorId}-${variant.sizeId}`, variant])));

    if (this.isSizeOnlyMode) {
      const mergedVariants = sizes.map((sizeId) => {
        const key = `0-${sizeId}`;
        const existing = existingVariants.get(key);
        return existing ? existing : {
          colorId: 0,
          sizeId,
          price: 0,
          isActive: true,
          imageUrl: undefined,
        } as ProductVariantForm;
      });

      this.variants.set(mergedVariants);
      this.variantsDirty.set(true);
      return;
    }

    const colors = this.selectedColorIds();
    if (!colors.length) {
      this.formError.set('Selecciona al menos un color para generar variantes.');
      return;
    }

    const response = await firstValueFrom(this.productService.generateVariants({ colorIds: colors, sizeIds: sizes }));
    const mergedVariants = response.variants.map((variant) => {
      const key = `${variant.colorId}-${variant.sizeId}`;
      const existing = existingVariants.get(key);
      return existing ? existing : {
        colorId: variant.colorId,
        sizeId: variant.sizeId,
        price: 0,
        isActive: true,
        imageUrl: undefined,
      } as ProductVariantForm;
    });

    this.variants.set(mergedVariants);
    this.variantsDirty.set(true);
  }

  onVariantPriceChange(index: number, value: string) {
    const price = Number(value);
    this.variantsDirty.set(true);
    this.variants.update((current) => {
      const next = [...current];
      next[index] = { ...next[index], price: Number.isNaN(price) ? 0 : price };
      return next;
    });
  }

  onVariantImageChange(index: number, value: string) {
    this.variantsDirty.set(true);
    this.variants.update((current) => {
      const next = [...current];
      next[index] = { ...next[index], imageUrl: value.trim() || undefined };
      return next;
    });
  }

  onVariantActiveChange(index: number, checked: boolean) {
    this.variantsDirty.set(true);
    this.variants.update((current) => {
      const next = [...current];
      next[index] = { ...next[index], isActive: checked };
      return next;
    });
  }

  onProductImagesChange(files: FileList | null) {
    if (!files) {
      return;
    }
    this.imagesDirty.set(true);

    const selectedImages = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));

    this.productImages.update((current) => [...current, ...selectedImages]);
  }

  async removeProductImage(index: number) {
    const image = this.productImages()[index];
    this.formError.set('');
    this.formMessage.set('');
    this.deletingImageIndex.set(index);
    this.imagesDirty.set(true);

    if (image.publicId) {
      try {
        await firstValueFrom(this.productService.deleteImage(image.publicId));
        this.formMessage.set('Imagen eliminada');
      } catch (error) {
        console.error('Error eliminando imagen:', error);
        this.formError.set('Error al eliminar la imagen');
        this.deletingImageIndex.set(null);
        return;
      }
    }

    this.productImages.update((current) => current.filter((_, idx) => idx !== index));
    this.deletingImageIndex.set(null);
  }

  async onVariantImageFileChange(files: FileList | null, index: number) {
    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];
    const preview = URL.createObjectURL(file);
    this.variantsDirty.set(true);

    this.variants.update((current) => {
      const next = [...current];
      next[index] = { ...next[index], imageFile: file, imagePreview: preview } as ProductVariantForm;
      return next;
    });
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private async buildImageFilesPayload() {
    const images = this.productImages();
    const fileImages = [] as Array<{ filename: string; data: string }>;

    for (const image of images) {
      if (image.file) {
        const data = await this.fileToBase64(image.file);
        fileImages.push({ filename: image.file.name, data });
      }
    }

    return fileImages;
  }

  private async buildVariantPayload(currentVariants: ProductVariantForm[], mode: ProductVariantMode) {
    const payloadVariants = [] as Array<{
      colorId?: number;
      sizeId?: number;
      price: number;
      imageUrl?: string;
      imageFile?: { filename: string; data: string };
    }>;

    for (const variant of currentVariants) {
      const variantPayload: any = {
        price: variant.price,
      };

      if (mode === 'MATRIX') {
        variantPayload.colorId = variant.colorId;
        variantPayload.sizeId = variant.sizeId;
      } else if (mode === 'SIZE_ONLY') {
        variantPayload.sizeId = variant.sizeId;
      }
      variantPayload.isActive = variant.isActive !== false;

      if (variant.imageUrl) {
        variantPayload.imageUrl = variant.imageUrl;
      }

      if (variant.imageFile) {
        variantPayload.imageFile = {
          filename: variant.imageFile.name,
          data: await this.fileToBase64(variant.imageFile),
        };
      }

      payloadVariants.push(variantPayload);
    }

    return payloadVariants;
  }

  async saveProduct() {
    this.submitted = true;
    this.formError.set('');

    if (this.productForm.invalid) {
      return;
    }

    const name = this.productForm.value.name.trim();
    const description = String(this.productForm.value.description || '').trim();
    const categoryId = Number(this.productForm.value.categoryId);
    const isActive = this.productForm.value.isActive;
    const mode = this.variantMode();

    const currentVariants = this.variants();
    const shouldValidateVariants = !this.isEditing || this.variantsDirty();
    if (shouldValidateVariants) {
      if (!currentVariants.length) {
        this.formError.set(
          this.isSimpleMode
            ? 'Configura el precio de la variante unica antes de guardar.'
            : 'Genera las variantes antes de crear o actualizar el producto.',
        );
        return;
      }

      const invalidVariant = currentVariants.some((variant) => variant.price <= 0);
      if (invalidVariant) {
        this.formError.set('Cada variante debe tener un precio mayor que 0.');
        return;
      }
    }

    if (this.isEditing) {
      const original = this.editingProduct();
      if (!original) return;

      const payload: ProductUpdateRequest = {};
      const normalizedDescription = description || '';
      const originalDescription = original.description || '';

      if (name !== original.name) payload.name = name;
      if (normalizedDescription !== originalDescription) payload.description = normalizedDescription;
      if (categoryId !== original.categoryId) payload.categoryId = categoryId;
      if (isActive !== original.isActive) payload.isActive = isActive;

      if (this.imagesDirty()) {
        const keptImageUrls = this.productImages()
          .filter((image) => image.url)
          .map((image) => image.url!) || [];
        const imageFiles = await this.buildImageFilesPayload();
        payload.imageUrls = keptImageUrls;
        if (imageFiles.length) payload.imageFiles = imageFiles;
      }

      if (this.variantsDirty()) {
        const payloadVariants = await this.buildVariantPayload(currentVariants, mode);
        payload.variantMode = mode;
        payload.colorIds = mode === 'MATRIX' ? this.selectedColorIds() : [];
        payload.sizeIds = this.isSimpleMode ? [] : this.selectedSizeIds();
        payload.variants = payloadVariants;
      }

      if (Object.keys(payload).length === 0) {
        this.formMessage.set('No hay cambios para actualizar.');
        return;
      }

      this.productSaved.emit({
        mode: 'edit',
        id: original.id,
        payload,
      });
      return;
    }

    const imageFiles = await this.buildImageFilesPayload();
    const payloadVariants = await this.buildVariantPayload(currentVariants, mode);

    const payload: ProductCreateRequest = {
      name,
      description,
      categoryId,
      variantMode: mode,
      colorIds: mode === 'MATRIX' ? this.selectedColorIds() : [],
      sizeIds: this.isSimpleMode ? [] : this.selectedSizeIds(),
      imageFiles: imageFiles.length ? imageFiles : undefined,
      variants: payloadVariants,
    };

    this.productSaved.emit({
      mode: 'create',
      payload
    });
  }

  closeModal() {
    const modal = document.getElementById('product-modal') as HTMLDialogElement;
    if (modal) {
      modal.close();
    }
    this.setEditingProduct(null);
  }

  get sizeLabels() {
    return this.sizes;
  }

  getVariantPreview(variant: ProductVariantForm) {
    return variant.imagePreview || variant.imageUrl || '';
  }

  getColorName(colorId: number): string {
    if (!colorId || colorId <= 0) {
      return '-';
    }
    return this.colors.find((color) => color.id === colorId)?.name ?? 'N/A';
  }

  getSizeName(sizeId: number): string {
    if (!sizeId || sizeId <= 0) {
      return '-';
    }
    return this.sizes.find((size) => size.id === sizeId)?.name ?? 'N/A';
  }
}
