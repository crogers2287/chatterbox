import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useStore } from '@/lib/store';
import { Upload, X, FileText, Plus, FolderPlus, Play } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

export function BatchProcessing() {
  const { 
    batchItems, 
    addBatchItem, 
    removeBatchItem, 
    clearBatchItems,
    updateBatchItem,
    processBatch 
  } = useStore();
  
  const [manualText, setManualText] = useState('');
  const [manualFilename, setManualFilename] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'text/plain': ['.txt'],
      'text/csv': ['.csv'],
      'text/markdown': ['.md', '.markdown'],
    },
    multiple: true,
    onDrop: async (acceptedFiles) => {
      for (const file of acceptedFiles) {
        const text = await file.text();
        
        if (file.name.endsWith('.csv')) {
          // Parse CSV - assume each row is a separate text
          const lines = text.split('\n').filter(line => line.trim());
          lines.forEach((line, index) => {
            addBatchItem(line.trim(), `${file.name}-line-${index + 1}`);
          });
        } else {
          // For txt and md files, add as single item
          addBatchItem(text, file.name);
        }
      }
    },
  });

  const handleAddManual = () => {
    if (manualText.trim()) {
      addBatchItem(
        manualText.trim(), 
        manualFilename.trim() || `text-${Date.now()}`
      );
      setManualText('');
      setManualFilename('');
    }
  };

  const handleProcessBatch = () => {
    if (batchItems.length > 0) {
      processBatch();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const text = await file.text();
      
      if (file.name.endsWith('.csv')) {
        // Parse CSV - assume each row is a separate text
        const lines = text.split('\n').filter(line => line.trim());
        lines.forEach((line, index) => {
          addBatchItem(line.trim(), `${file.name}-line-${index + 1}`);
        });
      } else {
        // For txt files, add as single item
        addBatchItem(text, file.name);
      }
    }
    
    // Clear the input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Batch Processing</CardTitle>
            <CardDescription>
              Process multiple texts at once for TTS generation
            </CardDescription>
          </div>
          
          <div className="flex gap-2">
            {batchItems.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearBatchItems}
                >
                  Clear All
                </Button>
                <Button
                  size="sm"
                  onClick={handleProcessBatch}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Process {batchItems.length} Item{batchItems.length !== 1 ? 's' : ''}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* File Upload Area */}
        <div className="space-y-4">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-primary bg-primary/10' : 'border-muted-foreground/25 hover:border-primary'
            }`}
          >
            <input {...getInputProps()} />
            <FolderPlus className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-1">
              {isDragActive
                ? 'Drop the files here...'
                : 'Drag & drop text files here, or click to select'}
            </p>
            <p className="text-xs text-muted-foreground">
              Supports: .txt, .md (one item per file), .csv (one item per line)
            </p>
          </div>
          
          {/* Hidden file input for folder selection */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.csv,.md,.markdown"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="w-full"
          >
            <FolderPlus className="mr-2 h-4 w-4" />
            Select Multiple Files from Folder
          </Button>
        </div>

        {/* Manual Text Input */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Add Text Manually</h4>
          <Textarea
            placeholder="Enter text to generate..."
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            className="min-h-[100px]"
          />
          <div className="flex gap-2">
            <Input
              placeholder="Filename (optional)"
              value={manualFilename}
              onChange={(e) => setManualFilename(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={handleAddManual}
              disabled={!manualText.trim()}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </div>
        </div>

        {/* Batch Items List */}
        {batchItems.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Batch Queue ({batchItems.length})</h4>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {batchItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg"
                >
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.filename || 'Untitled'}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {item.text}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => removeBatchItem(item.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {batchItems.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <p>No items in batch queue.</p>
            <p className="text-sm mt-1">Add files or text to start batch processing.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}