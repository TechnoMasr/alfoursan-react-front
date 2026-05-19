/** نوع الرسم المطلوب بعد اكتمال التبديل إلى Google */
let pendingDrawType = null;

export function setPendingGoogleDraw(type) {
  pendingDrawType = type;
}

export function takePendingGoogleDraw() {
  const type = pendingDrawType;
  pendingDrawType = null;
  return type;
}
