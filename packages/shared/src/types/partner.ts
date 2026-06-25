import { UUID } from './user';

/** Type of partner organization */
export type PartnerType = 'veterinary_clinic' | 'shelter' | 'pet_store' | 'ngo';

/** Represents a partner organization (vet clinics, shelters, etc.) */
export interface Partner {
  id: UUID;
  name: string;
  type: PartnerType;
  contactEmail: string;
  verified: boolean;
}
