export const ALL_TOOLS = [
  {
    "type": "function",
    "name": "request_human_transfer",
    "description": "Use only when the caller clearly asks to speak with the tenant configured human destination.",
    "parameters": {
      "type": "object",
      "properties": {
        "reason": {
          "type": "string"
        }
      },
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "report_priority_issue",
    "description": "Use when the caller clearly describes a tenant-defined urgent or priority situation.",
    "parameters": {
      "type": "object",
      "properties": {
        "reason": {
          "type": "string"
        }
      },
      "required": [
        "reason"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "nbb_get_business_context",
    "description": "Load the real Nearby Booker tenant configuration, configured service catalog, customer-estimate delivery availability, and booking requirements. Consume this context silently; never read internal configuration or capability state to the caller.",
    "parameters": {
      "type": "object",
      "properties": {},
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "nbb_answer_business_question",
    "description": "Search the tenant Nearby Booker FAQ/business knowledge. Use for business-specific questions instead of guessing.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string"
        }
      },
      "required": [
        "query"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "nbb_validate_address",
    "description": "Validate and canonicalize the caller service address with Nearby Booker before availability or booking. If validation succeeds, continue automatically with the validated address; do not ask the caller to confirm it again unless validation fails.",
    "parameters": {
      "type": "object",
      "properties": {
        "address": {
          "type": "string"
        }
      },
      "required": [
        "address"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "nbb_get_availability",
    "description": "Get live Nearby Booker availability for a validated service address and configured service UUID/quantity selections. ALWAYS translate the caller current date/time meaning into the structured constraints object. Hard constraints are authoritative: never offer a slot outside them merely because it is a savings date. Nearby Booker itself resolves the address to the correct eligible Team Calendars/zones and returns only live-checked slots; never choose a calendar, truck, technician, zone, or opening yourself. Use date_mode exact for a specific day, on_or_before for a deadline, on_or_after for a starting date, range for a date span, and any only when the caller gave no date constraint. Use the corresponding time_mode for time-of-day constraints. The result classifies qualifying savings dates and standard availability and supplies spoken_window/savings fields for customer-facing presentation.",
    "parameters": {
      "type": "object",
      "properties": {
        "address": {
          "type": "string",
          "description": "Validated service address used for NBB availability and routing. When scheduling an unchanged loaded estimate, Relay may supply the saved estimate address."
        },
        "estimate_id": {
          "type": "string",
          "description": "Optional six-digit saved estimate number when checking availability to schedule an unchanged estimate loaded with nbb_lookup_estimate. NBB reloads its authoritative saved services/address."
        },
        "services": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "service_uuid": {
                "type": "string"
              },
              "quantity": {
                "type": "number"
              }
            },
            "required": [
              "service_uuid",
              "quantity"
            ],
            "additionalProperties": false
          }
        },
        "constraints": {
          "type": "object",
          "description": "Normalized caller scheduling constraints. This is semantic state, not phrase matching. Hard caller constraints override savings-date preference.",
          "properties": {
            "date_mode": {
              "type": "string",
              "enum": [
                "any",
                "exact",
                "on_or_before",
                "on_or_after",
                "range"
              ],
              "description": "Use exact for one requested day; on_or_before for a deadline such as 'by September 20'; on_or_after for a starting date; range for an allowed date span; any when the caller gave no date constraint."
            },
            "start_date": {
              "type": "string",
              "description": "YYYY-MM-DD. Required for exact, on_or_after, and range."
            },
            "end_date": {
              "type": "string",
              "description": "YYYY-MM-DD. Required for on_or_before and range."
            },
            "time_mode": {
              "type": "string",
              "enum": [
                "any",
                "before",
                "after",
                "range"
              ],
              "description": "Use before/after/range for a caller time preference; any when no time constraint was given."
            },
            "start_time": {
              "type": "string",
              "description": "HH:MM local business time. Required for after and range."
            },
            "end_time": {
              "type": "string",
              "description": "HH:MM local business time. Required for before and range."
            }
          },
          "required": [
            "date_mode",
            "time_mode"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "address",
        "services",
        "constraints"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "nbb_get_quote",
    "description": "Calculate authoritative Nearby Booker pricing for configured service UUID/quantity selections. Pass a returned appointment slot when the caller selected one so appointment-specific savings can be included.",
    "parameters": {
      "type": "object",
      "properties": {
        "services": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "service_uuid": {
                "type": "string"
              },
              "quantity": {
                "type": "number"
              }
            },
            "required": [
              "service_uuid",
              "quantity"
            ],
            "additionalProperties": false
          }
        },
        "slot": {
          "type": "object",
          "properties": {
            "date": {
              "type": "string",
              "description": "Appointment date exactly as returned by Nearby Booker in YYYY-MM-DD format."
            },
            "window": {
              "type": "object",
              "description": "Appointment window exactly as returned by Nearby Booker.",
              "properties": {
                "start": {
                  "type": "string",
                  "description": "Start time exactly as returned by Nearby Booker in HH:MM format."
                },
                "end": {
                  "type": "string",
                  "description": "End time exactly as returned by Nearby Booker in HH:MM format."
                }
              },
              "required": [
                "start",
                "end"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "date",
            "window"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "services"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "nbb_lookup_estimate",
    "description": "Load an existing six-digit Nearby Booker estimate as a READ-ONLY authoritative object. Use this whenever the caller gives an estimate number and asks what is included, wants it resent/revised, or wants to schedule it. On success, reuse the returned saved services/quantities and customer/address data; never ask the caller to name the services again. Do not claim the saved estimate was modified by this lookup.",
    "parameters": {
      "type": "object",
      "properties": {
        "estimate_id": {
          "type": "string",
          "description": "The caller-supplied six-digit Nearby Booker estimate number."
        }
      },
      "required": [
        "estimate_id"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "voice_set_booking_phone",
    "description": "Resolve the booking contact phone inside the live Voice session before preparing a booking. First ask whether the caller wants to use the number they are calling from or a different number. Use mode caller only after the caller chooses the live caller number. Use mode alternate when they choose a different number; include phone when they provide it. This tool manages Voice state only and does not create or modify a booking.",
    "parameters": {
      "type": "object",
      "properties": {
        "mode": {
          "type": "string",
          "enum": [
            "caller",
            "alternate"
          ]
        },
        "phone": {
          "type": "string",
          "description": "Different booking phone number when mode is alternate and the caller has provided it."
        }
      },
      "required": [
        "mode"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "voice_set_booking_notes",
    "description": "Record the caller appointment-notes decision inside the live Voice session. Ask the configured notes question before using this tool. Use mode none when the caller does not want to add a note. Use mode set only after the caller has supplied the actual note text; preserve the caller meaning faithfully and never invent details. This tool manages Voice state only and does not create or modify a booking.",
    "parameters": {
      "type": "object",
      "properties": {
        "mode": {
          "type": "string",
          "enum": [
            "none",
            "set"
          ]
        },
        "notes": {
          "type": "string",
          "description": "Caller-supplied appointment note when mode is set."
        }
      },
      "required": [
        "mode"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "nbb_prepare_booking",
    "description": "Validate the full booking with Nearby Booker and return the exact final review. This does not create a booking. Reuse customer details already captured earlier in the same call. The booking phone MUST already be resolved through voice_set_booking_phone; never assume the Twilio caller number is the appointment contact number. Use only after collecting required customer details, configured services, one live slot, and a confirmed booking phone.",
    "parameters": {
      "type": "object",
      "properties": {
        "customer": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string"
            },
            "phone": {
              "type": "string"
            },
            "email": {
              "type": "string"
            },
            "address": {
              "type": "string"
            },
            "sms_opt_in": {
              "type": "boolean"
            },
            "email_opt_in": {
              "type": "boolean"
            },
            "referral_code": {
              "type": "string"
            },
            "booking_notes": {
              "type": "string"
            }
          },
          "required": [
            "name",
            "address"
          ],
          "additionalProperties": true
        },
        "services": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "service_uuid": {
                "type": "string"
              },
              "quantity": {
                "type": "number"
              }
            },
            "required": [
              "service_uuid",
              "quantity"
            ],
            "additionalProperties": false
          }
        },
        "slot": {
          "type": "object",
          "properties": {
            "date": {
              "type": "string",
              "description": "Appointment date exactly as returned by Nearby Booker in YYYY-MM-DD format."
            },
            "window": {
              "type": "object",
              "description": "Appointment window exactly as returned by Nearby Booker.",
              "properties": {
                "start": {
                  "type": "string",
                  "description": "Start time exactly as returned by Nearby Booker in HH:MM format."
                },
                "end": {
                  "type": "string",
                  "description": "End time exactly as returned by Nearby Booker in HH:MM format."
                }
              },
              "required": [
                "start",
                "end"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "date",
            "window"
          ],
          "additionalProperties": false
        },
        "estimate_id": {
          "type": "string",
          "description": "Optional six-digit saved estimate number when scheduling an unchanged estimate loaded with nbb_lookup_estimate. Omit it if the caller changed the saved service/quantity set unless a revised estimate was created first."
        }
      },
      "required": [
        "customer",
        "services",
        "slot"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "nbb_commit_booking",
    "description": "Create the exact Nearby Booker booking that was most recently prepared in this call. Use ONLY after reading back the validated review and the caller explicitly confirms they want that appointment submitted.",
    "parameters": {
      "type": "object",
      "properties": {},
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "nbb_lookup_existing_booking",
    "description": "Find and securely verify an active/future appointment using the authenticated live caller number plus the caller-supplied service address. Ask for the service address first. Address matching tolerates normal spoken formatting differences, but the platform remains authoritative. If the result says address_retry, ask for the street number/street name again and DO NOT say there is no appointment. If more than one appointment remains, ask the caller for the CURRENT appointment date; if the result then requests appointment_time, ask for the current appointment start time. Never reveal candidate appointment dates/times before verification, silently select among multiple appointments, invent a booking ID, or invent a verification token.",
    "parameters": {
      "type": "object",
      "properties": {
        "purpose": {
          "type": "string",
          "enum": [
            "reschedule",
            "cancel"
          ]
        },
        "address": {
          "type": "string"
        },
        "appointment_date": {
          "type": "string",
          "description": "YYYY-MM-DD only when the caller supplied the current appointment date to disambiguate multiple matches."
        },
        "appointment_time": {
          "type": "string",
          "description": "Current appointment start time only when the platform still reports multiple matches after date disambiguation."
        }
      },
      "required": [
        "purpose",
        "address"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "nbb_get_reschedule_availability",
    "description": "Get live replacement availability using the already verified existing booking services and address. Never ask the caller to reconstruct services.",
    "parameters": {
      "type": "object",
      "properties": {
        "verification_token": {
          "type": "string"
        },
        "constraints": {
          "type": "object",
          "description": "Normalized caller scheduling constraints. This is semantic state, not phrase matching. Hard caller constraints override savings-date preference.",
          "properties": {
            "date_mode": {
              "type": "string",
              "enum": [
                "any",
                "exact",
                "on_or_before",
                "on_or_after",
                "range"
              ],
              "description": "Use exact for one requested day; on_or_before for a deadline such as 'by September 20'; on_or_after for a starting date; range for an allowed date span; any when the caller gave no date constraint."
            },
            "start_date": {
              "type": "string",
              "description": "YYYY-MM-DD. Required for exact, on_or_after, and range."
            },
            "end_date": {
              "type": "string",
              "description": "YYYY-MM-DD. Required for on_or_before and range."
            },
            "time_mode": {
              "type": "string",
              "enum": [
                "any",
                "before",
                "after",
                "range"
              ],
              "description": "Use before/after/range for a caller time preference; any when no time constraint was given."
            },
            "start_time": {
              "type": "string",
              "description": "HH:MM local business time. Required for after and range."
            },
            "end_time": {
              "type": "string",
              "description": "HH:MM local business time. Required for before and range."
            }
          },
          "required": [
            "date_mode",
            "time_mode"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "verification_token",
        "constraints"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "nbb_submit_reschedule_request",
    "description": "Submit the verified replacement slot as an admin reschedule request. Use only after the caller explicitly confirms the new slot. This does not let the model invent booking details.",
    "parameters": {
      "type": "object",
      "properties": {
        "verification_token": {
          "type": "string"
        },
        "slot": {
          "type": "object",
          "properties": {
            "date": {
              "type": "string",
              "description": "Appointment date exactly as returned by Nearby Booker in YYYY-MM-DD format."
            },
            "window": {
              "type": "object",
              "description": "Appointment window exactly as returned by Nearby Booker.",
              "properties": {
                "start": {
                  "type": "string",
                  "description": "Start time exactly as returned by Nearby Booker in HH:MM format."
                },
                "end": {
                  "type": "string",
                  "description": "End time exactly as returned by Nearby Booker in HH:MM format."
                }
              },
              "required": [
                "start",
                "end"
              ],
              "additionalProperties": false
            }
          },
          "required": [
            "date",
            "window"
          ],
          "additionalProperties": false
        }
      },
      "required": [
        "verification_token",
        "slot"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "nbb_submit_cancel_request",
    "description": "Submit a verified cancellation request for admin approval. Use only after reading back the matched appointment date/time and the caller explicitly confirms they want it cancelled.",
    "parameters": {
      "type": "object",
      "properties": {
        "verification_token": {
          "type": "string"
        }
      },
      "required": [
        "verification_token"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "nbb_send_estimate",
    "description": "Create or resend a REAL Nearby Booker customer estimate through the existing estimate delivery workflow. Delivery may be sms, email, or both when enabled. The delivery argument must always represent the caller's CURRENT choice; if they change channels, use the new value. Repeating this tool with unchanged quote details resends the same saved estimate instead of requiring a new estimate. For SMS, the platform automatically uses the actual caller number; do NOT ask the caller to repeat or confirm that number. Do not use generic nbb_send_sms or nbb_send_email for estimates. The estimate total is calculated internally by NBB and may remain unspoken when Phone Agent pricing is off.",
    "parameters": {
      "type": "object",
      "properties": {
        "delivery": {
          "type": "string",
          "enum": [
            "sms",
            "email",
            "both"
          ],
          "description": "How the caller explicitly asked to receive the estimate: sms, email, or both."
        },
        "customer": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "Customer full name for the real estimate record."
            },
            "email": {
              "type": "string",
              "description": "Customer email when email delivery is requested or required by tenant settings."
            },
            "address": {
              "type": "string",
              "description": "Optional service address if provided."
            },
            "referral_code": {
              "type": "string"
            },
            "booking_notes": {
              "type": "string"
            }
          },
          "required": [
            "name"
          ],
          "additionalProperties": true
        },
        "services": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "service_uuid": {
                "type": "string"
              },
              "quantity": {
                "type": "number"
              }
            },
            "required": [
              "service_uuid",
              "quantity"
            ],
            "additionalProperties": false
          }
        },
        "existing_estimate_id": {
          "type": "string",
          "description": "Optional six-digit saved estimate number when resending an unchanged existing estimate. Omit this when the caller changed services/quantities so NBB creates a revised estimate instead of overwriting the original."
        }
      },
      "required": [
        "delivery",
        "customer",
        "services"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "nbb_send_sms",
    "description": "Send customer-requested NON-ESTIMATE information through the tenant Nearby Booker SMS system. Never use this tool for a quote or estimate; use nbb_send_estimate instead. Use only after the caller explicitly asks to receive a text message and confirms the recipient number.",
    "parameters": {
      "type": "object",
      "properties": {
        "message": {
          "type": "string",
          "description": "Concise customer-facing information the caller explicitly requested by text. The platform sends only to the actual caller number; the model cannot choose another destination."
        }
      },
      "required": [
        "message"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "nbb_send_email",
    "description": "Send customer-requested NON-ESTIMATE information through the tenant Nearby Booker email system. Never use this tool for a quote or estimate; use nbb_send_estimate instead. Use only after the caller explicitly asks to receive an email and confirms the recipient address.",
    "parameters": {
      "type": "object",
      "properties": {
        "to": {
          "type": "string",
          "description": "Customer email address to receive the requested email."
        },
        "subject": {
          "type": "string"
        },
        "message": {
          "type": "string",
          "description": "Customer-facing information the caller explicitly requested by email."
        }
      },
      "required": [
        "to",
        "message"
      ],
      "additionalProperties": false
    }
  },
  {
    "type": "function",
    "name": "nbb_request_callback",
    "description": "Send a real Phone Agent callback request to the business through Nearby Booker. Use only after collecting a callback phone number and a brief reason. The verified Twilio caller number may be used without asking the caller to repeat it.",
    "parameters": {
      "type": "object",
      "properties": {
        "customer": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string"
            },
            "phone": {
              "type": "string"
            },
            "email": {
              "type": "string"
            }
          },
          "additionalProperties": false
        },
        "request_text": {
          "type": "string",
          "description": "Brief customer-facing summary of what the caller wants the business to call them about."
        },
        "service_address": {
          "type": "string"
        }
      },
      "required": [
        "customer",
        "request_text"
      ],
      "additionalProperties": false
    }
  }
];
