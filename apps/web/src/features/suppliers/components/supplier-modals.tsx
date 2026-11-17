import type { SupplierDetailDto, SupplierDto } from '@istana-buah/shared';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Modal } from '../../../components/ui/modal';
import { normalizeApiError } from '../../../lib/api/api-error';
import { cn } from '../../../lib/cn';
import { formatRupiah, formatTransactionDateTime } from '../../pos/utils/formatters';
import {
  createSupplier,
  deleteSupplier,
  getSupplierById,
  updateSupplier,
} from '../api/supplier-api';
import { PO_STATUS_META } from '../utils/supplier-meta';

export interface SupplierFormModalProps {
  isOpen: boolean;
  supplierToEdit?: SupplierDto | null;
  onClose: () => void;
  onSaved: (supplier: SupplierDto) => void;
}

export function SupplierFormModal({
  isOpen,
  supplierToEdit,
  onClose,
  onSaved,
}: SupplierFormModalProps) {
  const nameId = useId();
  const contactId = useId();
  const phoneId = useId();
  const addressId = useId();
  const notesId = useId();
  const activeId = useId();

  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (supplierToEdit) {
      setName(supplierToEdit.name);
      setContactPerson(supplierToEdit.contactPerson ?? '');
      setPhoneNumber(supplierToEdit.phoneNumber ?? '');
      setAddress(supplierToEdit.address ?? '');
      setNotes(supplierToEdit.notes ?? '');
      setIsActive(supplierToEdit.isActive);
    } else {
      setName('');
      setContactPerson('');
      setPhoneNumber('');
      setAddress('');
      setNotes('');
      setIsActive(true);
    }
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [isOpen, supplierToEdit]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setErrorMessage('Nama supplier minimal 2 karakter.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: trimmed,
        contactPerson: contactPerson.trim() || null,
        phoneNumber: phoneNumber.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        isActive,
      };
      const saved = supplierToEdit
        ? await updateSupplier(supplierToEdit.id, payload)
        : await createSupplier(payload);
      onSaved(saved);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={supplierToEdit ? 'Ubah Data Supplier' : 'Tambah Supplier Baru'}
      description="Simpan kontak pemasok buah segar untuk pencatatan Purchase Order dan hutang dagang."
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        {errorMessage ? (
          <Alert variant="danger" title="Gagal menyimpan supplier">
            {errorMessage}
          </Alert>
        ) : null}

        <div>
          <label htmlFor={nameId} className="mb-1.5 block text-sm font-medium text-ink-primary">
            Nama Supplier <span className="text-semantic-danger-ink">*</span>
          </label>
          <Input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: CV Agro Makmur / Kebun Pak Budi"
            maxLength={120}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor={contactId}
              className="mb-1.5 block text-sm font-medium text-ink-primary"
            >
              Nama Kontak (PIC)
            </label>
            <Input
              id={contactId}
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="Nama narahubung"
              maxLength={120}
            />
          </div>
          <div>
            <label htmlFor={phoneId} className="mb-1.5 block text-sm font-medium text-ink-primary">
              Nomor Telepon / WA
            </label>
            <Input
              id={phoneId}
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="08xxxxxxxxxx"
              maxLength={30}
            />
          </div>
        </div>

        <div>
          <label htmlFor={addressId} className="mb-1.5 block text-sm font-medium text-ink-primary">
            Alamat Pemasok
          </label>
          <Input
            id={addressId}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Alamat gudang atau kebun..."
            maxLength={500}
          />
        </div>

        <div>
          <label htmlFor={notesId} className="mb-1.5 block text-sm font-medium text-ink-primary">
            Catatan Pembayaran / Pengiriman
          </label>
          <Input
            id={notesId}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Contoh: Jatuh tempo 7 hari, kirim jam 05.00..."
            maxLength={1000}
          />
        </div>

        <label htmlFor={activeId} className="flex items-center gap-2.5 text-sm text-ink-primary">
          <input
            id={activeId}
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-5 w-5 rounded border-border-strong text-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700"
          />
          <span>Supplier aktif untuk pemesanan</span>
        </label>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Menyimpan...'
              : supplierToEdit
                ? 'Simpan Perubahan'
                : 'Tambah Supplier'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export interface SupplierDeleteModalProps {
  isOpen: boolean;
  supplier: SupplierDto | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

export function SupplierDeleteModal({
  isOpen,
  supplier,
  onClose,
  onDeleted,
}: SupplierDeleteModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setIsDeleting(false);
    }
  }, [isOpen, supplier?.id]);

  if (!supplier) return null;

  const handleConfirm = async () => {
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      await deleteSupplier(supplier.id);
      onDeleted(supplier.id);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Hapus Supplier"
      description="Supplier yang dihapus akan dinonaktifkan dari daftar pemesanan baru."
      size="sm"
    >
      <div className="space-y-4">
        {errorMessage ? (
          <Alert variant="danger" title="Penghapusan Ditolak">
            {errorMessage}
          </Alert>
        ) : null}

        <p className="text-sm text-ink-secondary">
          Yakin ingin menghapus supplier{' '}
          <strong className="text-ink-primary">{supplier.name}</strong>?
        </p>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isDeleting}
            onClick={() => void handleConfirm()}
          >
            {isDeleting ? 'Menghapus...' : 'Ya, Hapus Supplier'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export interface SupplierDetailModalProps {
  isOpen: boolean;
  supplierId: string | null;
  onClose: () => void;
}

export function SupplierDetailModal({ isOpen, supplierId, onClose }: SupplierDetailModalProps) {
  const [detail, setDetail] = useState<SupplierDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !supplierId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);
    void getSupplierById(supplierId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setErrorMessage(normalizeApiError(err).message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, supplierId]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={detail ? `Detail Supplier: ${detail.name}` : 'Detail Supplier'}
      size="lg"
    >
      {isLoading ? (
        <p className="py-6 text-center text-sm text-ink-muted">Memuat riwayat supplier...</p>
      ) : errorMessage ? (
        <Alert variant="danger" title="Gagal memuat detail">
          {errorMessage}
        </Alert>
      ) : detail ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-border-subtle bg-surface-subtle/40 p-3.5 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-ink-muted">Narahubung</p>
              <p className="font-medium text-ink-primary">{detail.contactPerson || '-'}</p>
              <p className="text-xs text-ink-secondary">{detail.phoneNumber || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Total Pembelian</p>
              <p className="font-semibold text-ink-primary tabular-nums">
                {formatRupiah(Number(detail.totalPurchaseAmount))}
              </p>
              <p className="text-xs text-ink-muted">{detail.purchaseOrderCount} Purchase Order</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Sisa Hutang Dagang</p>
              <p
                className={cn(
                  'font-semibold tabular-nums',
                  Number(detail.outstandingDebt) > 0
                    ? 'text-semantic-danger-ink'
                    : 'text-primary-800',
                )}
              >
                {formatRupiah(Number(detail.outstandingDebt))}
              </p>
            </div>
          </div>

          {detail.address || detail.notes ? (
            <div className="space-y-1 text-xs text-ink-secondary">
              {detail.address ? <p>Alamat: {detail.address}</p> : null}
              {detail.notes ? <p>Catatan: {detail.notes}</p> : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-ink-primary">Purchase Order Terbaru</h3>
            {detail.recentPurchaseOrders.length === 0 ? (
              <p className="text-xs text-ink-muted">Belum ada Purchase Order untuk supplier ini.</p>
            ) : (
              <div className="max-h-60 space-y-2 overflow-y-auto">
                {detail.recentPurchaseOrders.map((po) => {
                  const meta = PO_STATUS_META[po.status];
                  return (
                    <div
                      key={po.id}
                      className="flex flex-col justify-between gap-1.5 rounded-xl border border-border-subtle p-3 text-xs sm:flex-row sm:items-center"
                    >
                      <div>
                        <p className="font-semibold text-ink-primary tabular-nums">
                          {po.referenceNo ?? po.id}
                        </p>
                        <p className="text-ink-muted">{formatTransactionDateTime(po.createdAt)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 tabular-nums">
                        <span
                          className={cn(
                            'rounded-full border px-2 py-0.5 font-medium',
                            meta.badgeClass,
                          )}
                        >
                          {meta.label}
                        </span>
                        <span className="font-semibold text-ink-primary">
                          {formatRupiah(Number(po.totalAmount))}
                        </span>
                        {Number(po.remainingDebt) > 0 ? (
                          <span className="text-semantic-danger-ink">
                            Hutang {formatRupiah(Number(po.remainingDebt))}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
