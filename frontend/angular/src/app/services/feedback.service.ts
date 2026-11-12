import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

@Injectable({providedIn:'root'})
export class FeedbackService {
  private doc = inject(DOCUMENT);
  async success(title: string): Promise<void> {
    if (!this.doc.body || !this.doc.defaultView) return;
    try {
      const { default: Swal } = await import('sweetalert2/dist/sweetalert2.esm.all.js');
      await Swal.fire({position:'center',icon:'success',titleText:title,showConfirmButton:false,timer:1500,returnFocus:false});
    } catch { /* El estado accesible de cada formulario conserva la confirmación. */ }
  }
}
