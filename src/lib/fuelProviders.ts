export interface FuelProvider {
  name: string;
  place: string;
  legalId: string;
}

export const FUEL_PROVIDERS: FuelProvider[] = [
  {
    name: "Dist. Gracia Martinez S.A.",
    place: "La Cruz",
    legalId: "3-101-245747",
  },
];

export const FUEL_PROVIDER_OPTIONS = FUEL_PROVIDERS.map((provider) => provider.name);

export const findFuelProvider = (name: string) =>
  FUEL_PROVIDERS.find((provider) => provider.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());
