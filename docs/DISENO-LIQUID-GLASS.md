# Rediseño Liquid Glass — 10 de noviembre de 2026

La navegación flotante, tarjetas, formularios, botones y paneles utilizan transparencias, desenfoque de fondo, saturación y bordes con reflejos. La portada incluye objetos Three.js, materiales con iluminación de entorno, partículas y una fotografía con fondo transparente. Es una interpretación web del lenguaje visual, no el componente nativo de Apple. Referencia: https://developer.apple.com/design/human-interface-guidelines/materials

## Imagen

Generada con la herramienta integrada de imágenes, usando `frontend/img/hero/soficora.webp` como referencia. Se conserva el original. La nueva imagen está en `frontend/img/hero/soficora-editorial-v2.png`; su versión WebP optimizada para la página está en `frontend/img/hero/soficora-editorial-v2.webp` (aproximadamente 161 kB).

Prompt utilizado:

> Use case: identity-preserve / background-extraction. Edit target: the supplied photograph of the black-haired makeup model. Create an extremely clean high-resolution photographic cutout for a luxury cosmetics website campaign. Preserve the SAME woman's exact facial identity, facial features, hairstyle, hair color, complexion, eye makeup, glossy lips, pose, looking direction and hand with black fingernails. Remove the entire purple heart background and all background graphics, producing genuine alpha transparency. Retain the complete visible head, hair, hand and shoulders with beautifully refined hair edges. Remove purple background color contamination from edges only, with subtle natural neutral studio color balance. Keep authentic photographic skin texture and existing makeup, avoid plastic doll skin. Do not add products, jewelry, text, logos or decorations. Portrait composition, subject comfortably filling frame with a small clear margin above the hair. This is an identity-preserving background removal edit, not a new face.

El usuario pidió este acabado para toda la tienda después de descartar la primera portada. Los resultados funcionales y pruebas del backend se conservan.

## Ajuste de interacción solicitado

Se conserva la paleta cálida original de By Jers (marfil, rosa y texto oscuro). Liquid Glass se aplica a navegación, botones, tarjetas, controles y paneles con transparencia clara, reflejos y desenfoque, sin reemplazar el color base de la tienda.

La portada añade entrada de secciones al desplazarse, un carrusel deslizable de ofertas con controles, un riel animado de marcas que se pausa al apuntarlo y el revelado de una segunda fotografía de producto cuando está disponible y se pasa el cursor o se enfoca con teclado. En móvil los carruseles se recorren con gesto táctil; las animaciones respetan `prefers-reduced-motion`.
