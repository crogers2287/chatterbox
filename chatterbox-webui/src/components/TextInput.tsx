import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, FileText, Edit } from 'lucide-react';
import { useStore } from '@/lib/store';

export function TextInput() {
  const [text, setText] = useState('');
  const { addChunk } = useStore();

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'text/plain': ['.txt'],
      'text/markdown': ['.md', '.markdown'],
      'application/pdf': ['.pdf'],
      'application/epub+zip': ['.epub'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/x-mobipocket-ebook': ['.mobi'],
    },
    multiple: false,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0];
        // Handle different file types
        if (file.type === 'text/plain' || file.type === 'text/markdown' || file.name.endsWith('.md')) {
          const content = await file.text();
          setText(content);
        } else {
          alert('Currently only .txt and .md files are supported. Other formats coming soon!');
        }
      }
    },
  });

  const processText = () => {
    if (!text.trim()) return;

    // Simple sentence splitting for now
    // In a full implementation, you'd have more sophisticated chunking
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    // Group sentences into chunks of reasonable size
    const chunkSize = 3; // sentences per chunk
    for (let i = 0; i < sentences.length; i += chunkSize) {
      const chunk = sentences.slice(i, i + chunkSize).join(' ').trim();
      if (chunk) {
        addChunk(chunk);
      }
    }

    setText('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Text Input</CardTitle>
        <CardDescription>
          Upload a file or paste text to convert to speech
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">
              <Upload className="mr-2 h-4 w-4" />
              Upload File
            </TabsTrigger>
            <TabsTrigger value="editor">
              <Edit className="mr-2 h-4 w-4" />
              Text Editor
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="upload">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-primary bg-primary/10' : 'border-muted-foreground/25 hover:border-primary'
              }`}
            >
              <input {...getInputProps()} />
              <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-2">
                {isDragActive
                  ? 'Drop the file here...'
                  : 'Drag & drop a file here, or click to select'}
              </p>
              <p className="text-xs text-muted-foreground">
                Supports: .txt, .md, .pdf, .epub, .docx, .mobi
              </p>
            </div>
          </TabsContent>
          
          <TabsContent value="editor">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter or paste your text here..."
              className="w-full h-64 p-4 rounded-md border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </TabsContent>
        </Tabs>

        <Button 
          onClick={processText} 
          className="w-full mt-4"
          disabled={!text.trim()}
        >
          Process Text
        </Button>
      </CardContent>
    </Card>
  );
}