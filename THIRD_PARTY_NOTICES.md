# Third-party notices

## Three.js

This project uses Three.js and its Water2, Reflector, Refractor, GLTFLoader and post-processing addons. The two water normal maps in `public/textures/` are from the official Three.js r180 examples:

https://github.com/mrdoob/three.js/tree/r180/examples/textures/water

The SMAA post-processing addon includes its area and search lookup textures in the bundled Three.js module; it does not load remote resources.

The MIT License

Copyright © 2010-2025 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## Meshoptimizer

The Meshopt decoder bundled with Three.js r180 is used to load the compressed cottage model. Its WebAssembly code is embedded in the local JavaScript bundle; it does not load a CDN or external decoder file.

Source: https://github.com/zeux/meshoptimizer

Copyright (C) 2016-2024, by Arseny Kapoulkine (arseny.kapoulkine@gmail.com)

Meshoptimizer is distributed under the MIT License. The complete MIT License text reproduced above applies to Meshoptimizer with this copyright notice.
