import LlamaStackClient from 'llama-stack-client';

const client = new LlamaStackClient({
  baseURL: ""
});

export const model = await client.models.register({ model_id: 'model_id' });
