export const resetPassword =(user,serviceBaseUrl,userVerificaionToken )=>{
   
      
   let template =      `<!DOCTYPE html>
        <html
          lang="en"
          xmlns="http://www.w3.org/1999/xhtml"
          xmlns:v="urn:schemas-microsoft-com:vml"
          xmlns:o="urn:schemas-microsoft-com:office:office"
        >
          <head>
            <meta charset="utf-8" />
            <!-- utf-8 works for most cases -->
            <meta name="viewport" content="width=device-width" />
            <!-- Forcing initial-scale shouldn't be necessary -->
            <meta http-equiv="X-UA-Compatible" content="IE=edge" />
            <!-- Use the latest (edge) version of IE rendering engine -->
            <meta name="x-apple-disable-message-reformatting" />
            <!-- Disable auto-scale in iOS 10 Mail entirely -->
            <title></title>
            <!-- The title tag shows in email notifications, like Android 4.4. -->
        
            <link
              href="https://fonts.googleapis.com/css?family=Poppins:200,300,400,500,600,700"
              rel="stylesheet"
            />
            <style>
              html,
              body {
                margin: 0 auto !important;
                padding: 0 !important;
                height: 100% !important;
                width: 100% !important;
                background: #f1f1f1;
              }
              * {
                -ms-text-size-adjust: 100%;
                -webkit-text-size-adjust: 100%;
              }
              div[style*="margin: 16px 0"] {
                margin: 0 !important;
              }
              table,
              td {
                mso-table-lspace: 0pt !important;
                mso-table-rspace: 0pt !important;
              }
        
              /* What it does: Fixes webkit padding issue. */
              table {
                border-spacing: 0 !important;
                border-collapse: collapse !important;
                table-layout: fixed !important;
                margin: 0 auto !important;
              }
              img {
                -ms-interpolation-mode: bicubic;
              }
              a {
                text-decoration: none;
              }
              *[x-apple-data-detectors],
              .unstyle-auto-detected-links *,
              .aBn {
                border-bottom: 0 !important;
                cursor: default !important;
                color: inherit !important;
                text-decoration: none !important;
                font-size: inherit !important;
                font-family: inherit !important;
                font-weight: inherit !important;
                line-height: inherit !important;
              }
              .a6S {
                display: none !important;
                opacity: 0.01 !important;
              }
              .im {
                color: inherit !important;
              }
              img.g-img + div {
                display: none !important;
              }
              @media only screen and (min-device-width: 320px) and (max-device-width: 374px) {
                u ~ div .email-container {
                  min-width: 320px !important;
                }
              }
              /* iPhone 6, 6S, 7, 8, and X */
              @media only screen and (min-device-width: 375px) and (max-device-width: 413px) {
                u ~ div .email-container {
                  min-width: 375px !important;
                }
              }
              /* iPhone 6+, 7+, and 8+ */
              @media only screen and (min-device-width: 414px) {
                u ~ div .email-container {
                  min-width: 414px !important;
                }
              }
            </style>
        
            <style>
              /*BUTTON*/
              .btn {
                padding: 10px 15px;
                display: inline-block;
              }
              .btn.btn-primary {
                border-radius: 5px;
                background: #17bebb;
                color: #ffffff;
              }
              .hero {
                position: relative;
                z-index: 0;
              }
              .hero .text h2 {
                color: #000;
                font-size: 34px;
                margin-bottom: 0;
                font-weight: 200;
                line-height: 1.4;
              }
              .hero .text h3 {
                font-size: 24px;
                font-weight: 300;
                font-family: "Poppins", sans-serif;
                color: #000000;
              }
              .hero .text h2 span {
                font-weight: 600;
                color: #000;
              }
              .text-author {
                max-width: 50%;
                margin: 0 auto;
              }
              @media screen and (max-width: 500px) {
              }
            </style>
          </head>
        
          <body
            width="100%"
            style="margin: 0; padding: 0 !important; mso-line-height-rule: exactly"
          >
            <center style="width: 100%; background-color: #f1f1f1">
              <div
                style="
                  display: none;
                  font-size: 1px;
                  max-height: 0px;
                  max-width: 0px;
                  opacity: 0;
                  overflow: hidden;
                  mso-hide: all;
                  font-family: sans-serif;
                "
              >
                &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
              </div>
              <div style="max-width: 500px; margin: 0 auto" class="email-container">
                <!-- Begin Body -->
                <table
                  align="center"
                  role="presentation"
                  cellspacing="0"
                  cellpadding="0"
                  border="0"
                  width="100%"
                  style="margin: auto"
                >
                  <tr>
                    <td valign="top" style="padding: 1em 2.5em 0 2.5em">
                      <table
                        role="presentation"
                        border="0"
                        cellpadding="0"
                        cellspacing="0"
                        width="100%"
                      >
                        <tr>
                          <td class="logo" style="text-align: center"  width="329.000000pt" height="48.000000pt" >
                            
                        <img src="https://i.ibb.co/kMdcjB8/Union-18.png" alt="logo" border="0">
  
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td
                      valign="middle"
                      class="hero bg_white"
                      style="padding: 1em 0 0 0; background-color: #f1f1f1"
                    >
                      <table
                        role="presentation"
                        border="0"
                        cellpadding="0"
                        cellspacing="0"
                        width="100%"
                        style="
                          background-color: white;
                          border-radius: 12px;
                          border-top: 4px solid #44CBFF;
                          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
                        "
                      > 
                      
                        <tr>
                          <td style="padding: 0 2.5em">
                            <h3
                              style="
                                margin-top: 40px;
                                text-align: center;
                                font-family: Helvetica, Arial, sans-serif;
                                font-size: 20px;
                                font-weight: 700;
                                line-height: 20px;
                                color: rgb(23, 43, 77);
                              "
                            >
                            Reset your password
                            </h3>
                            <h3
                              style="
                                margin-top: 40px;
                                font-family: Helvetica, Arial, sans-serif;
                                font-size: 14px;
                                font-weight: 700;
                                line-height: 20px;
                                color: rgb(23, 43, 77);
                              "
                            >
                              Dear ${user.firstName},
                            </h3>
                            <div class="text">
                              <h4
                                style="
                                  margin-top: 25px;
                                  font-family: Helvetica, Arial, sans-serif;
                                  font-size: 14px;
                                  font-weight: 400;
                                  line-height: 20px;
                                  color: rgb(23, 43, 77);
                                "
                              >
                                 Your have requested password change. To ensure the
                                security of your account, please verify your email
                                address by clicking the link below:
                              </h4>
                            </div>
                          </td>
                        </tr>
                        <tr>
                          <td style="text-align: center">
                            <div class="text-author">
                              <p>
                                <a
                                  href="http://${serviceBaseUrl}/reset-password?token=${userVerificaionToken}"
                                  class="btn btn-primary"
                                  style="background-color: #44CBFF; color: #fff"
                                  >Reset Password</a
                                >
                              </p>
                            </div>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 0 2.5em">
                            <div class="text">
                              <h4
                                style="
                                  margin-top: 25px;
                                  font-family: Helvetica, Arial, sans-serif;
                                  font-size: 14px;
                                  font-weight: 400;
                                  line-height: 20px;
                                  color: rgb(23, 43, 77);
                                "
                              >
                                This link is time-sensitive and will expire after 24
                                hours.
                              </h4>
                            </div>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 0 2.5em">
                            <div class="text">
                              <h4
                                style="
                                  font-family: Helvetica, Arial, sans-serif;
                                  font-size: 14px;
                                  font-weight: 400;
                                  line-height: 20px;
                                  color: rgb(23, 43, 77);
                                "
                              >
                                If you did not register on DriverBook or have any
                                concerns, please contact our support team at
                                support@mydriverbook.com.
                              </h4>
                            </div>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 0 2.5em; padding-bottom: 3em">
                            <h3
                              style="
                                margin-top: 10px;
                                font-family: Helvetica, Arial, sans-serif;
                                font-size: 14px;
                                font-weight: 700;
                                line-height: 20px;
                                color: rgb(23, 43, 77);
                              "
                            >
                              Best regards,
                            </h3>
                            <h3
                              style="
                                margin-top: 10px;
                               
                                font-family: Helvetica, Arial, sans-serif;
                                font-size: 14px;
                                font-weight: 700;
                                line-height: 20px;
                                color: rgb(23, 43, 77);
                              "
                            >
                              The DriverBook Team
                            </h3>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                  <td valign="top" style="padding: 1em 2.5em 0 2.5em">
                  </td>
                  </tr>
                </table>
              </div>
            </center>
          </body>
        </html>
        `
     return template;
}