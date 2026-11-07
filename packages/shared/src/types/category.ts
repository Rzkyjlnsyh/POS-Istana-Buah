/** Representasi kategori produk pada respons API (Bagian 6.2 model Category). */
export interface CategoryDto {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  /** Jumlah produk aktif (belum dihapus) yang memakai kategori ini. */
  productCount: number;
  createdAt: string;
  updatedAt: string;
}
