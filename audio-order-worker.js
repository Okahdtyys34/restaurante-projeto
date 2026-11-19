let transcriber;
self.onmessage = async ({data: samples}) => {
  try {
    // Remove quiet edges and reject silence before invoking speech recognition.
    const frame = 320;
    const voiced = [];
    for (let start = 0; start < samples.length; start += frame) {
      const end = Math.min(start + frame, samples.length);
      let energy = 0;
      for (let i = start; i < end; i++) energy += samples[i] * samples[i];
      if (Math.sqrt(energy / (end - start)) > 0.008) voiced.push(start);
    }
    if (voiced.length < 15) {
      self.postMessage({status:'done',text:''});
      return;
    }
    samples = samples.slice(Math.max(0, voiced[0] - 3200), Math.min(samples.length, voiced.at(-1) + frame + 3200));
    if (!transcriber) {
      self.postMessage({status: 'loading'});
      const {env, pipeline} = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js');
      env.allowLocalModels = false;
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.proxy = false;
      transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
        device: 'wasm',
        dtype: 'q8',
        revision: '5332fcc35e32a33b86612b9a57a89be7906102b1',
      });
    }
    self.postMessage({status: 'transcribing'});
    const result = await transcriber(samples, {
      language: 'portuguese',
      task: 'transcribe',
      chunk_length_s: 25,
      stride_length_s: 4,
      condition_on_prev_tokens: false,
    });
    self.postMessage({status: 'done', text: result.text.trim()});
  } catch {
    self.postMessage({status: 'error'});
  }
};
