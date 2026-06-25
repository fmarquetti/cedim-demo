import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser } from "lucide-react";

const TicketScreenshotEditor = forwardRef(function TicketScreenshotEditor({ screenshot }, ref) {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    if (!screenshot || !canvasRef.current) return;

    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      canvas.width = image.width;
      canvas.height = image.height;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
    };
    image.src = screenshot;
  }, [screenshot]);

  useImperativeHandle(ref, () => ({
    toBlob() {
      return new Promise((resolve) => {
        canvasRef.current?.toBlob(resolve, "image/png", 0.95);
      });
    },
    clear() {
      clearMarks();
    },
  }));

  function getPoint(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = event.touches?.[0] || event.changedTouches?.[0];
    const clientX = touch?.clientX ?? event.clientX;
    const clientY = touch?.clientY ?? event.clientY;

    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function prepareBrush() {
    const context = canvasRef.current.getContext("2d");
    context.strokeStyle = "#dc2626";
    context.lineWidth = 7;
    context.lineCap = "round";
    context.lineJoin = "round";
    return context;
  }

  function startDrawing(event) {
    event.preventDefault();
    if (!canvasRef.current) return;

    const point = getPoint(event);
    const context = prepareBrush();
    context.beginPath();
    context.moveTo(point.x, point.y);
    setDrawing(true);
  }

  function draw(event) {
    if (!drawing || !canvasRef.current) return;

    event.preventDefault();
    const point = getPoint(event);
    const context = prepareBrush();
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function stopDrawing() {
    setDrawing(false);
  }

  function clearMarks() {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
  }

  return (
    <div className="ticket-screenshot-editor">
      <div className="ticket-editor-toolbar">
        <span>Pincel rojo</span>
        <button type="button" className="secondary-button" onClick={clearMarks}>
          <Eraser size={16} />
          Limpiar marcas
        </button>
      </div>

      <div className="ticket-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="ticket-canvas"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          onTouchCancel={stopDrawing}
        />
      </div>
    </div>
  );
});

export default TicketScreenshotEditor;
