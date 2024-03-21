import { ForgotPasswordResponse } from "../models/forgotPasswordResponse .model";
import { ClientProxy } from '@nestjs/microservices';
import { async, firstValueFrom } from 'rxjs';
import { Logger,NotFoundException } from "@nestjs/common";
export const emailCheck=async(email:string,userClient:ClientProxy,driverClient:ClientProxy):Promise<any>=>{
    try{
        let user={}
        let userResponse = userClient.send(
          { cmd: 'get_user_by_email' },
          email,
        );
    
        let driverResponse = driverClient.send(
          { cmd: 'get_driver_by_email' },
          email,
        );
    
        const userResults = await firstValueFrom(userResponse);
        const driverResult = await firstValueFrom(driverResponse);
    
        if (userResults.isError && driverResult.isError) {
          Logger.log(`user not found or credentials not correct`);
          throw new NotFoundException(`User not found`);
        } else if (userResults?.data) {      
          Logger.log(`user find with email ${email}`);
          user['data']=userResults.data
          user['isDriver'] = false;
        } else if(driverResult?.data) {
          Logger.log(`driver Login with credentials ${email}`);
          user['data'] =driverResult.data;
          user['isDriver'] = true;
        }
        return user;
    }
    catch(err){
        Logger.error({ message: err.message, stack: err.stack });
        throw err;
    }
}