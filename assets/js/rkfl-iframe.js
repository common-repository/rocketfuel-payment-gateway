; (function ($, window, document) {
    'use strict';

    // if (document.getElementById('place_order'))
    //     document.getElementById('place_order').style.display = 'none';
    var selector = '#rocketfuel_retrigger_payment_button';
    /**
     * Payment Engine object
     */
    var RocketfuelPaymentEngine = {

        order_id: '',
        url: new URL(window.location.href),
        watchIframeShow: false,
        rkflConfig: null,
        encryptedReq: null,
        accessToken: '',
        paymentResponse: '',
        // Show error notice at top of checkout form, or else within button container
        showError: function (errorMessage, selector) {
            var $container = $('.woocommerce-notices-wrapper, form.checkout');

            if (!$container || !$container.length) {
                $(selector).prepend(errorMessage);
                return;
            } else {
                $container = $container.first();
            }

            // Adapted from https://github.com/woocommerce/woocommerce/blob/ea9aa8cd59c9fa735460abf0ebcb97fa18f80d03/assets/js/frontend/checkout.js#L514-L529
            $('.woocommerce-NoticeGroup-checkout, .woocommerce-error, .woocommerce-message').remove();
            $container.prepend('<div class="woocommerce-NoticeGroup woocommerce-NoticeGroup-checkout">' + errorMessage + '</div>');
            $container.find('.input-text, select, input:checkbox').trigger('validate').trigger('blur');

            var scrollElement = $('.woocommerce-NoticeGroup-checkout');
            if (!scrollElement.length) {
                scrollElement = $container;
            }

            if ($.scroll_to_notices) {
                $.scroll_to_notices(scrollElement);
            } else {
                // Compatibility with WC <3.3
                $('html, body').animate({
                    scrollTop: ($container.offset().top - 100)
                }, 1000);
            }

            $(document.body).trigger('checkout_error');
        }
        ,
        getUUID: async function (partial_tx_check = true) {
            let engine = this;

            let firstname = document.getElementById('billing_first_name')?.value || document.getElementById('shipping_first_name')?.value;
            let lastname = document.getElementById('billing_last_name')?.value || document.getElementById('shipping_last_name')?.value;
            let email = document.getElementById('billing_email')?.value || document.getElementById('shipping_email')?.value;

            let url = wc_rkfl_context.start_checkout_url;
            // // let url = document.querySelector('input[name=admin_url_rocketfuel]').value;
            // if (email) {
            //     url += '&email=' + email;

            // }
            // if (lastname) {
            //     url += '&lastname=' + lastname;
            // }
            // if (firstname) {
            //     url += '&firstname=' + firstname;
            // }
            var data = $('form.checkout')
                .add($('<input type="hidden" name="nonce" /> ')
                    .attr('value', wc_rkfl_context.start_checkout_nonce)
                ).add($('<input type="hidden" name="rkfl_checkout_firstname" /> ')
                    .attr('value', firstname)
                ).add($('<input type="hidden" name="rkfl_checkout_lastname" /> ')
                    .attr('value', lastname)
                ).add($('<input type="hidden" name="rkfl_checkout_email" /> ')
                    .attr('value', email)
                ).add($('<input type="hidden" name="rkfl_checkout_partial_tx_check" /> ')
                    .attr('value', partial_tx_check)
                )
                .serialize();
            let response = await fetch(url, {
                method: 'post',
                cache: 'no-cache',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: data
            });
            let result = {};
            let rawresult = await response.text();

            if (rawresult) {
                try {
                    result = JSON.parse(rawresult);
                } catch (error) {
                    result.messages = ['Error parsing request'];
                    console.error(' ERROR_PARSE_GUUID', { error });
                }
            }

            if (!result.success) {

                RocketfuelPaymentEngine.prepareRetrigger();
                // Error messages may be preformatted in which case response structure will differ
                var messages = result.data ? result.data.messages : result.messages;

                console.log("Messages from start checkout", { result });
                if (!messages) {
                    messages = ['Gateway request error'];
                }
                if ('string' === typeof messages) {
                    this.showError(messages);
                } else {
                    var messageItems = messages.map(function (message) {
                        return '<li>' + message + '</li>';
                    }).join('');
                    this.showError('<ul class="woocommerce-error" role="alert">' + messageItems + '</ul>', selector);
                }

                return null;

            }

            let uuid = result.data?.ext?.result?.uuid;
            let isPartial = result.data?.is_partial;

            if (!uuid) {
                this.showError(['Could not generate invoice']);

                return false;
            }

            RocketfuelPaymentEngine.order_id = result.data.temporary_order_id;
            RocketfuelPaymentEngine.access_token = result.data?.ext?.access_token;
            // RocketfuelPaymentEngine.encryptedReq = result.data?.encrypted_req;

            document.querySelector('input[name=encrypted_req_rocketfuel]').value = result.data?.encrypted_req;

            document.querySelector('input[name=temp_orderid_rocketfuel]').value = result.data.temporary_order_id;
            if (!engine.userData.encrypted_req && !result.data?.encrypted_req) {
                engine.userData.encrypted_req = result.data?.encrypted_req;
            }

            if (!engine.userData.merchant_auth && result.data?.merchant_auth) {
                engine.userData.merchant_auth = result.data?.merchant_auth
            }

            console.log("res", uuid);

            return { uuid, isPartial, ...result.data };

        },
        getEnvironment: function () {
            let environment = document.querySelector('input[name=environment_rocketfuel]')?.value;

            return environment || 'prod';
        },
        userData: {},
        getUserData: function () {
            let engine = this;

            if (!engine?.userData?.first_name) {
                engine.userData.first_name = document.getElementById('billing_first_name') ? document.getElementById('billing_first_name').value : null
            }
            if (!engine?.userData?.last_name) {
                engine.userData.last_name = document.getElementById('billing_last_name') ? document.getElementById('billing_last_name').value : null
            }
            if (!engine?.userData?.email) {
                engine.userData.email = document.getElementById('billing_email') ? document.getElementById('billing_email').value : null
            }
            if (!engine?.userData?.merchant_auth) {
                engine.userData.merchant_auth = document.querySelector('input[name=merchant_auth_rocketfuel]') ? document.querySelector('input[name=merchant_auth_rocketfuel]').value : null
            }

            if (!engine?.userData?.encrypted_req_rocketfuel) {
                engine.userData.encrypted_req_rocketfuel = document.querySelector('input[name=encrypted_req_rocketfuel]') ? document.querySelector('input[name=encrypted_req_rocketfuel]').value : null
            }
            // let user_data = {

            //     first_name: document.getElementById('billing_first_name') ? document.getElementById('billing_first_name').value : null,

            //     last_name: document.getElementById('billing_last_name') ? document.getElementById('billing_last_name').value : null,

            //     email: document.getElementById('billing_email') ? document.getElementById('billing_email').value : null,

            //     merchant_auth: document.querySelector('input[name=merchant_auth_rocketfuel]') ? document.querySelector('input[name=merchant_auth_rocketfuel]').value : null,
            //     encrypted_req: document.querySelector('input[name=encrypted_req_rocketfuel]') ? document.querySelector('input[name=encrypted_req_rocketfuel]').value : null
            // }

            // if (!user_data) return false;

            return engine.userData

        },
        triggerPlaceOrder: function () {
            // document.getElementById('place_order').style.display = 'inherit';
            console.log('Trigger is calling');

            $('form.checkout').trigger('submit');

            // document.getElementById('place_order').style.display = 'none';

            console.log('Trigger has neen called ');
        },
        updateOrder: function (result) {
            try {

                console.log("Response from callback :", result, result?.status === undefined);


                let status = "wc-on-hold";

                if (result?.status === undefined) {
                    return false;
                }

                let result_status = parseInt(result.status);

                if (result_status === 101) {
                    status = "wc-partial-payment";
                }

                if (result_status === 1) {

                    status = document.querySelector('input[name=payment_complete_order_status]')?.value || 'wc-processing';

                    //placeholder to get order status set by seller
                }

                if (result_status === -1) {
                    status = "wc-failed";
                }

                document.querySelector('input[name=order_status_rocketfuel]').value = status;

                document.querySelector('input[name=payment_status_rocketfuel]').value = 'complete';

                localStorage.setItem('payment_status_rocketfuel', 'complete');

                document.getElementById('rocketfuel_retrigger_payment_button').dataset.disable = true;

                document.getElementById('rocketfuel_retrigger_payment_button').style.opacity = 0.5;

            } catch (error) {
                console.error('Error from update order method', error);
            }
        },

        startPayment: function (autoTriggerState = true) {

            this.watchIframeShow = true;

            document.getElementById('rocketfuel_retrigger_payment_button').disabled = true;

            let checkIframe = setInterval(() => {
                console.log('retrying');

                if (RocketfuelPaymentEngine.rkfl.iframeInfo.iframe) {

                    RocketfuelPaymentEngine.rkfl.initPayment();
                    clearInterval(checkIframe);
                }

            }, 500);

        },
        prepareRetrigger: function () {

            //show retrigger button
            document.getElementById('rocketfuel_retrigger_payment_button').dataset.disable = false;
            document.getElementById('rocketfuel_retrigger_payment_button').innerHTML = document.getElementById('rocketfuel_retrigger_payment_button').dataset.rkflButtonText;

        },
        prepareProgressMessage: function () {

            //revert trigger button message
            document.getElementById('rocketfuel_retrigger_payment_button').dataset.disable = true;
        },

        windowListener: function () {
            let engine = this;
            window.addEventListener('message', (event) => {

                switch (event.data.type) {
                    case 'rocketfuel_iframe_close':
                        try {
                            document.getElementById("iframeWrapper").style.display = 'none';
                        } catch (error) {}
                        console.log('Event from rocketfuel_iframe_close', event.data);
                        // engine.prepareRetrigger();
                        document.getElementById('rocketfuel_retrigger_payment_button').style.opacity = 1;

                        if (event.data.paymentCompleted === 1) {
                            engine.triggerPlaceOrder();
                        } else {
                            engine.prepareRetrigger();
                        }
                        break;
                    case 'rocketfuel_new_height':
                        engine.prepareProgressMessage();

                        engine.watchIframeShow = false;

                        document.getElementById('rocketfuel_retrigger_payment_button').innerHTML = document.getElementById('rocketfuel_retrigger_payment_button').dataset.rkflButtonText;
                        document.getElementById('rocketfuel_retrigger_payment_button').style.opacity = 0.5;


                    case 'rocketfuel_result_ok':



                        if (event.data.response) {

                            console.log('Payment response has been recorded');

                            engine.paymentResponse = event.data.response

                            engine.updateOrder(engine.paymentResponse);
                            try {
                                document.getElementById("iframeWrapper").style.display = 'none';
                            } catch (error) {}
                        }

                    default:
                        break;
                }

            })
        },
        setLocalStorage: function (key, value) {
            localStorage.setItem(key, value);
        },
        createElementAbstract: {
            partialPaymentNotificationModal: function () {
                //UNDERLAY
                const rkflPaymentPartialAlertModalUnderlay = document.createElement('div');
                rkflPaymentPartialAlertModalUnderlay.style.cssText = 'background: #00000070;position: fixed;top: 0;right: 0;height: 100%;width: 100%;'

                //MODAL
                const rkflPaymentPartialAlertModal = document.createElement('div');
                rkflPaymentPartialAlertModal.style.cssText = 'max-width: 400px; margin: auto; background: rgb(255, 255, 255); padding: 20px; margin-top: 20vh;'

                //MODAL CONTENT
                const rkflPaymentPartialAlertModalContent = document.createElement('div');
                rkflPaymentPartialAlertModalContent.innerText = 'You have already made partial payment on this order item. Are you sure to continue payment on the existing order?';

                //MODAL CONTENT BUTTON
                const rkflPaymentPartialAlertModalContentButton = document.createElement('div');
                rkflPaymentPartialAlertModalContentButton.style.cssText = 'display: flex; justify-content: space-around; margin-top: 20px; text-align: center; font-size: 14px;';

                //MODAL CONTENT BUTTON REJECT
                const rkflButtonReject = document.createElement('span');
                rkflButtonReject.innerText = 'No';
                rkflButtonReject.style.cssText = 'border: 2px solid #f0833c; padding: 6px 15px;width:120px;cursor:pointer';

                //MODAL CONTENT BUTTON ACCEPT
                const rkflButtonAccept = document.createElement('span');
                rkflButtonAccept.innerText = 'Yes, Continue';
                rkflButtonAccept.style.cssText = 'background:#f0833c; padding: 6px 15px;color:#fff;width:120px;cursor:pointer';

                return {
                    rkflPaymentPartialAlertModalUnderlay,
                    rkflPaymentPartialAlertModal,
                    rkflPaymentPartialAlertModalContent,
                    rkflPaymentPartialAlertModalContentButton,
                    rkflButtonReject,
                    rkflButtonAccept
                }
            },
            clearAppendedDom: (element) => {
                element.remove();
            }
        },
        userAgreeToPartialPayment: function () {
            return new Promise((resolve, reject) => {
                try {
                    const {
                        rkflPaymentPartialAlertModalUnderlay,
                        rkflPaymentPartialAlertModal,
                        rkflPaymentPartialAlertModalContent,
                        rkflPaymentPartialAlertModalContentButton,
                        rkflButtonReject,
                        rkflButtonAccept
                    } = RocketfuelPaymentEngine.createElementAbstract.partialPaymentNotificationModal();

                    rkflButtonReject.addEventListener('click', () => {
                        RocketfuelPaymentEngine.createElementAbstract.clearAppendedDom(rkflPaymentPartialAlertModalUnderlay)
                        resolve(false)
                    });


                    rkflButtonAccept.addEventListener('click', () => {
                        RocketfuelPaymentEngine.createElementAbstract.clearAppendedDom(rkflPaymentPartialAlertModalUnderlay)

                        resolve(true)
                    });

                    //APPEND ACTIONS
                    rkflPaymentPartialAlertModalContentButton.appendChild(rkflButtonReject);
                    rkflPaymentPartialAlertModalContentButton.appendChild(rkflButtonAccept);

                    rkflPaymentPartialAlertModal.appendChild(rkflPaymentPartialAlertModalContent);
                    rkflPaymentPartialAlertModal.appendChild(rkflPaymentPartialAlertModalContentButton);


                    rkflPaymentPartialAlertModalUnderlay.appendChild(rkflPaymentPartialAlertModal);
                    document.body.appendChild(rkflPaymentPartialAlertModalUnderlay);

                } catch (error) {
                    console.log(error.message)
                    resolve(false)
                }
            })
        },
        initRocketFuel: async function () {

            return new Promise(async (resolve, reject) => {

                if (!RocketFuel) {

                    location.reload();
                    reject();

                }

                let uuidResult = await this.getUUID(); //set uuid
                let uuid = uuidResult.uuid;
                let isPartial = uuidResult.isPartial;
                if (!uuid) {
                    reject();

                }

                document.getElementById('rocketfuel_retrigger_payment_button').dataset.disable = true;

                if (isPartial) {

                    const userAgreed = await this.userAgreeToPartialPayment();

                    if (!userAgreed) {

                        uuidResult = await this.getUUID(false); //set uuid

                        uuid = uuidResult.uuid;
                        console.log({ uuid }, 'User did not agree');

                        // isPartial = result.isPartial;

                    } else {
                        console.log({ uuid }, 'User did agree');
                    }

                }


                let userData = RocketfuelPaymentEngine.getUserData();
                if (!userData.encrypted_req) {
                    userData.encrypted_req = uuidResult.encrypted_req
                }
                if (!userData.merchant_auth) {
                    userData.merchant_auth = uuidResult.merchant_auth
                }

                let payload, response, rkflToken;

                RocketfuelPaymentEngine.rkfl = new RocketFuel({
                    environment: RocketfuelPaymentEngine.getEnvironment()
                });

                RocketfuelPaymentEngine.rkflConfig = {
                    uuid,
                    callback: RocketfuelPaymentEngine.updateOrder,
                    environment: RocketfuelPaymentEngine.getEnvironment()
                }
                if (userData.encrypted_req || (userData.first_name && userData.email)) {

                    payload = {
                        encryptedReq: userData.encrypted_req,
                        merchantAuth: userData.merchant_auth,
                        email: userData.email,

                    }
                    try {
                        console.log('details', userData.email, payload);


                        rkflToken = localStorage.getItem('rkfl_token');

                        if (!rkflToken && payload.merchantAuth) {
                            payload.accessToken = RocketfuelPaymentEngine.access_token;
                            payload.isSSO = true;
                            // payload = data.encryptedReq

                            response = await RocketfuelPaymentEngine.rkfl.rkflAutoSignUp(payload, RocketfuelPaymentEngine.getEnvironment());

                            if (response) {

                                rkflToken = response?.result?.rkflToken;

                            }
                        }

                        if (rkflToken) {
                            RocketfuelPaymentEngine.rkflConfig.token = rkflToken;
                        }

                        resolve(true);
                    } catch (error) {
                        console.error('There is an error in init', { error })
                        reject(error?.message);
                    }

                }

                if (RocketfuelPaymentEngine.rkflConfig) {

                    RocketfuelPaymentEngine.rkfl = new RocketFuel(RocketfuelPaymentEngine.rkflConfig); // init RKFL
                    resolve(true);

                } else {
                    resolve(false);
                }

            })

        },

        init: async function () {

            let engine = this;
            console.log('Start initiating RKFL');

            try {

                let res = await engine.initRocketFuel();
                console.log(res);

            } catch (error) {
                engine.prepareRetrigger();

                console.log('error from promise', error);

            }

            console.log('Done initiating RKFL');

            engine.windowListener();


            engine.startPayment();

        }
    }
    window.RocketfuelPaymentEngine = RocketfuelPaymentEngine;


    // document.querySelector("")

    document.querySelector(".rocketfuel_retrigger_payment_button")?.addEventListener('click', (e) => {

        e.preventDefault();

        if (e.target.dataset.disable == 'true') {
            console.warn('[ ACTION_DISALLOWED ] Button is disabled');
            return;
        }

        const retrigger = document.getElementById('rocketfuel_retrigger_payment_button');
        if (retrigger) {
            retrigger.innerHTML = '<div class="loader_rocket"></div>';
        }


        RocketfuelPaymentEngine.init();

    })
    const statusRKFL = document.querySelector('input[name=payment_status_rocketfuel]');
    if (statusRKFL) {
        document.querySelector('input[name=payment_status_rocketfuel]').value = localStorage.getItem('payment_status_rocketfuel');

    }


})(jQuery, window, document);
//v3.2.3.6