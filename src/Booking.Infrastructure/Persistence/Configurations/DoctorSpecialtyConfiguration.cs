using Booking.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Booking.Infrastructure.Persistence.Configurations;

public class DoctorSpecialtyConfiguration : IEntityTypeConfiguration<DoctorSpecialty>
{
    public void Configure(EntityTypeBuilder<DoctorSpecialty> builder)
    {
        builder.HasKey(ds => new { ds.DoctorId, ds.SpecialtyId });

        builder.HasOne(ds => ds.Doctor)
            .WithMany(d => d.DoctorSpecialties)
            .HasForeignKey(ds => ds.DoctorId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(ds => ds.Specialty)
            .WithMany()
            .HasForeignKey(ds => ds.SpecialtyId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
