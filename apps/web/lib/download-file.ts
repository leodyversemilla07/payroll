/**
 * Triggers a browser download of a base64-encoded file blob.
 */
export function downloadBase64File(
  base64: string,
  fileName: string,
  mimeType = "application/pdf",
): void {
  try {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array<number>(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error("Failed to download file:", error);
  }
}

/**
 * Triggers a browser download of a plain text / CSV / DAT string.
 */
export function downloadTextFile(
  content: string,
  fileName: string,
  mimeType = "text/plain;charset=utf-8",
): void {
  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error("Failed to download text file:", error);
  }
}
