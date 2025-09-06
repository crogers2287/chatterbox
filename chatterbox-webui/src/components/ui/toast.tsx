import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ToastProps {
  id: string;
  title: string;
  description?: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

interface ToastItemProps extends ToastProps {
  onClose: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({
  id,
  title,
  description,
  type = 'info',
  duration = 5000,
  onClose,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  const icons = {
    success: <CheckCircle className="h-5 w-5 text-green-600" />,
    error: <XCircle className="h-5 w-5 text-red-600" />,
    warning: <AlertCircle className="h-5 w-5 text-yellow-600" />,
    info: <Info className="h-5 w-5 text-blue-600" />,
  };

  const styles = {
    success: 'border-green-600',
    error: 'border-red-600',
    warning: 'border-yellow-600',
    info: 'border-blue-600',
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border bg-background p-4 shadow-lg',
        styles[type],
        'animate-in slide-in-from-right duration-300'
      )}
    >
      {icons[type]}
      <div className="flex-1">
        <h4 className="font-semibold">{title}</h4>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <button
        onClick={() => onClose(id)}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  useEffect(() => {
    const handleToast = (event: CustomEvent<ToastProps>) => {
      setToasts((prev) => [...prev, event.detail]);
    };

    window.addEventListener('show-toast' as any, handleToast);
    return () => window.removeEventListener('show-toast' as any, handleToast);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} {...toast} onClose={removeToast} />
      ))}
    </div>
  );
};

export const toast = {
  show: (props: Omit<ToastProps, 'id'>) => {
    const event = new CustomEvent('show-toast', {
      detail: {
        ...props,
        id: Date.now().toString(),
      },
    });
    window.dispatchEvent(event);
  },
  success: (title: string, description?: string) => {
    toast.show({ title, description, type: 'success' });
  },
  error: (title: string, description?: string) => {
    toast.show({ title, description, type: 'error' });
  },
  warning: (title: string, description?: string) => {
    toast.show({ title, description, type: 'warning' });
  },
  info: (title: string, description?: string) => {
    toast.show({ title, description, type: 'info' });
  },
};