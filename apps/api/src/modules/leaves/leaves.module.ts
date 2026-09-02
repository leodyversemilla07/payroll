import { Module } from "@nestjs/common";
import { LeavesService } from "./leaves.service";

@Module({
  providers: [LeavesService],
  exports: [LeavesService],
})
export class LeavesModule {}
