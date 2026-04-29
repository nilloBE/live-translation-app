import { DefaultAzureCredential } from "@azure/identity";

export function createAzureCredential() {
  return new DefaultAzureCredential();
}
