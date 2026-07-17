using Booking.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Booking.Infrastructure.Persistence.Configurations;

public class DoctorConfiguration : IEntityTypeConfiguration<Doctor>
{
    public void Configure(EntityTypeBuilder<Doctor> builder)
    {
        builder.Property(d => d.LicenseNumber).HasMaxLength(50).IsRequired();
        builder.Property(d => d.Biography).HasMaxLength(2000);

        builder.HasIndex(d => d.UserId).IsUnique();
        builder.HasIndex(d => d.LicenseNumber).IsUnique();

        builder.ToTable(t => t.HasCheckConstraint(
            "CK_Doctors_YearsOfExperience",
            "\"YearsOfExperience\" >= 0"));
    }
}
