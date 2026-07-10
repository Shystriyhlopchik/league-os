import { ArrayUnique, IsArray, IsInt } from 'class-validator';

export class SaveMatchRegistrationDto {
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  teamPlayerIds: number[];
}
