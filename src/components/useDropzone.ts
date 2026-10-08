import { useRef, useState } from "react";

export function useDropzone() {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const counter = useRef(0);

  const open = () => inputRef.current?.click();

  const handlers = {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      counter.current++;
      setDragging(true);
    },
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      counter.current--;
      if (counter.current <= 0) { counter.current = 0; setDragging(false); }
    },
  };

  return { dragging, setDragging, counter, inputRef, handlers, open };
}
