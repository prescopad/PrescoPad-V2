from pydantic import BaseModel
from typing import Optional


class ClinicRequest(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    logo_url: Optional[str] = None
    qr_code_url: Optional[str] = None
    qrCodeUrl: Optional[str] = None

    def normalized(self) -> dict:
        d = {}
        if "name" in self.model_fields_set:
            d["name"] = self.name
        if "address" in self.model_fields_set:
            d["address"] = self.address
        if "phone" in self.model_fields_set:
            d["phone"] = self.phone
        if "email" in self.model_fields_set:
            d["email"] = self.email
        if "logo_url" in self.model_fields_set:
            d["logo_url"] = self.logo_url
        if "qr_code_url" in self.model_fields_set or "qrCodeUrl" in self.model_fields_set:
            qr = self.qr_code_url if self.qr_code_url is not None else self.qrCodeUrl
            d["qr_code_url"] = qr
        return d
