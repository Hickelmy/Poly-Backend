import { PartialType } from '@nestjs/mapped-types';
import { CreateFeatureFlagDto } from './create-feature-flag.dto';

export class UpdateFeatureFlagDto extends PartialType(CreateFeatureFlagDto) {}
