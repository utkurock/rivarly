import { useState, useCallback } from 'react';

interface ModalOptions {
  type: 'success' | 'error' | 'warning' | 'info' | 'confirm' | 'delete';
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
}

interface ModalState extends ModalOptions {
  isOpen: boolean;
}

export const useCustomModal = () => {
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    type: 'info',
    title: '',
  });

  const showModal = useCallback((options: ModalOptions) => {
    setModal({
      ...options,
      isOpen: true,
    });
  }, []);

  const hideModal = useCallback(() => {
    setModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  const showSuccess = useCallback((title: string, message?: string) => {
    showModal({ type: 'success', title, message });
  }, [showModal]);

  const showError = useCallback((title: string, message?: string) => {
    showModal({ type: 'error', title, message });
  }, [showModal]);

  const showWarning = useCallback((title: string, message?: string) => {
    showModal({ type: 'warning', title, message });
  }, [showModal]);

  const showInfo = useCallback((title: string, message?: string) => {
    showModal({ type: 'info', title, message });
  }, [showModal]);

  const showConfirm = useCallback((
    title: string, 
    message: string, 
    onConfirm: () => void,
    confirmText = 'Confirm',
    cancelText = 'Cancel'
  ) => {
    showModal({ 
      type: 'confirm', 
      title, 
      message, 
      onConfirm,
      confirmText,
      cancelText
    });
  }, [showModal]);

  const showDelete = useCallback((
    title: string, 
    message: string, 
    onConfirm: () => void,
    confirmText = 'Delete',
    cancelText = 'Cancel'
  ) => {
    showModal({ 
      type: 'delete', 
      title, 
      message, 
      onConfirm,
      confirmText,
      cancelText
    });
  }, [showModal]);

  return {
    modal,
    showModal,
    hideModal,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showConfirm,
    showDelete,
  };
};

